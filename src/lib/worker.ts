import { env, pipeline, AutoModel, AutoProcessor, EdgeTamModel, RawImage, Tensor, VitMatteForImageMatting, type PreTrainedModel, type Processor } from '@huggingface/transformers'
import { MATTE_MODEL, SAM_MODEL, isGpuLimit, isGpuLost } from './models'
import type { Device, Runtime } from './models'

env.allowLocalModels = false

export type Status = { key: 'segmenting' } | { key: 'matting' } | { key: 'upscaling'; done: number; total: number }

export interface Bitmap {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Point { x: number; y: number; label: 0 | 1 }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Mask { data: Uint8ClampedArray; width: number; height: number }
// `count` candidate masks stacked in `data`, one plane of width*height each.
export interface Masks extends Mask { count: number; best: number }

export type Request =
  | { id: number; type: 'detect' }
  | { id: number; type: 'samEmbed'; image: Bitmap; device: Device }
  | { id: number; type: 'samMask'; points: Point[]; box: Box | null }
  | { id: number; type: 'matte'; image: Bitmap; device: Device }
  | { id: number; type: 'load'; task: 'bg' | 'sr'; model: string; revision: string; device: Device; dtype: string }
  | { id: number; type: 'removeBg'; image: Bitmap }
  | { id: number; type: 'upscale'; image: Bitmap; scale: number }

export type Response =
  | { id: number; type: 'progress'; file: string; progress: number; loaded: number; total: number }
  | { id: number; type: 'status'; status: Status }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; message: string }

type Pipe = Awaited<ReturnType<typeof pipeline>>
type SamState = {
  model: EdgeTamModel
  processor: Processor
  embeddings?: Record<string, Tensor>
  sizes?: { original_sizes: number[][]; reshaped_input_sizes: number[][] }
}
let sam: Promise<SamState> | null = null
let matte: Promise<{ model: VitMatteForImageMatting; processor: Processor }> | null = null
type Segmenter = { model: PreTrainedModel; processor: Processor }

const cache = new Map<string, Promise<Pipe | Segmenter>>()
const current: Record<'bg' | 'sr', string | null> = { bg: null, sr: null }

// An ONNX session holds its GPU buffers until it is disposed, so dropping a reference
// leaks them for the life of the worker; enough leaked sessions cost the whole device.
function release(entry: Promise<unknown> | null) {
  void entry?.then((v) => {
    const model = (v as { model?: { dispose?(): Promise<unknown> } }).model ?? (v as { dispose?(): Promise<unknown> })
    return model?.dispose?.()
  }).catch(() => {})
}

function dropCached(key: string | null) {
  if (!key) return
  release(cache.get(key) ?? null)
  cache.delete(key)
}

type Adapter = {
  features?: { has(name: string): boolean }
  limits?: { maxStorageBuffersPerShaderStage?: number }
}
type Gpu = { requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<Adapter | null> }

const ctx = self as unknown as { postMessage(m: Response, t?: Transferable[]): void; navigator: Navigator & { gpu?: Gpu } }
const post = (msg: Response, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer)

type ProgressInfo = { status: string; file?: string; progress?: number; loaded?: number; total?: number }

async function loadPipe(id: number, task: 'bg' | 'sr', model: string, revision: string, device: Device, dtype: string) {
  const key = `${task}:${model}:${revision}:${device}:${dtype}`
  if (!cache.has(key)) {
    const progress_callback = (p: ProgressInfo) => {
      if (p.status === 'progress' && p.file)
        post({ id, type: 'progress', file: p.file, progress: p.progress ?? 0, loaded: p.loaded ?? 0, total: p.total ?? 0 })
    }
    const opts = { device, dtype: dtype as 'fp32', revision, progress_callback }
    // Background-removal models on the Hub use ad-hoc model_type values, so we bypass the
    // pipeline registry and drive AutoModel + AutoProcessor directly.
    const promise: Promise<Pipe | Segmenter> =
      task === 'sr'
        ? pipeline('image-to-image', model, opts)
        : Promise.all([AutoModel.from_pretrained(model, opts), AutoProcessor.from_pretrained(model, { revision })]).then(
            ([m, p]) => ({ model: m, processor: p }),
          )
    cache.set(key, promise)
    promise.catch(() => cache.delete(key))
  }
  current[task] = key
  // Only the sessions in use are worth keeping: switching model, device or dtype
  // otherwise leaves the previous one holding its buffers for the rest of the session.
  for (const k of cache.keys()) if (k !== current.bg && k !== current.sr) dropCached(k)
  return cache.get(key)!
}

function toBitmap(img: RawImage): Bitmap {
  const rgba = img.channels === 4 ? img : img.rgba()
  return { data: rgba.data as Uint8ClampedArray, width: rgba.width, height: rgba.height }
}

async function removeBg(id: number, image: Bitmap) {
  const { model, processor } = (await cache.get(current.bg!)!) as Segmenter
  const input = new RawImage(image.data, image.width, image.height, 4)
  post({ id, type: 'status', status: { key: 'segmenting' } })
  const { pixel_values } = await processor(input)
  const { inputNames, outputNames } = (model as unknown as { sessions: Record<string, { inputNames: string[]; outputNames: string[] }> }).sessions.model
  const output = await model({ [inputNames.includes('pixel_values') ? 'pixel_values' : inputNames[0]]: pixel_values })
  const logits = (output[outputNames[0]] as Tensor).squeeze(0)
  const outOfRange = (logits.data as Float32Array).some((x) => x < -1e-5 || x > 1 + 1e-5)
  const mask = await RawImage.fromTensor((outOfRange ? logits.sigmoid() : logits).mul(255).to('uint8')).resize(image.width, image.height)
  const out = input.clone()
  out.putAlpha(mask)
  return toBitmap(out)
}

const TILE = 192
const OVERLAP = 16

async function upscale(id: number, image: Bitmap, scale: number) {
  const pipe = (await cache.get(current.sr!)!) as unknown as (i: RawImage) => Promise<RawImage>
  const src = new RawImage(image.data, image.width, image.height, 4)
  const alpha = new Uint8ClampedArray(image.width * image.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3]

  const W = image.width * scale
  const H = image.height * scale
  const out = new Uint8ClampedArray(W * H * 4)

  const cols = Math.ceil(image.width / TILE)
  const rows = Math.ceil(image.height / TILE)
  const total = cols * rows
  let done = 0

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const x0 = tx * TILE
      const y0 = ty * TILE
      const x1 = Math.min(x0 + TILE, image.width)
      const y1 = Math.min(y0 + TILE, image.height)
      const cx0 = Math.max(0, x0 - OVERLAP)
      const cy0 = Math.max(0, y0 - OVERLAP)
      const cx1 = Math.min(image.width, x1 + OVERLAP)
      const cy1 = Math.min(image.height, y1 + OVERLAP)

      const tile = await src.rgb().crop([cx0, cy0, cx1 - 1, cy1 - 1])
      const up = await pipe(tile)

      const ox = (x0 - cx0) * scale
      const oy = (y0 - cy0) * scale
      const w = (x1 - x0) * scale
      const h = (y1 - y0) * scale
      for (let y = 0; y < h; y++) {
        const dstRow = ((y0 * scale + y) * W + x0 * scale) * 4
        const srcRow = ((oy + y) * up.width + ox) * 3
        for (let x = 0; x < w; x++) {
          const d = dstRow + x * 4
          const s = srcRow + x * 3
          out[d] = up.data[s]
          out[d + 1] = up.data[s + 1]
          out[d + 2] = up.data[s + 2]
        }
      }
      done++
      post({ id, type: 'status', status: { key: 'upscaling', done, total } })
    }
  }

  const alphaUp = await new RawImage(alpha, image.width, image.height, 1).resize(W, H)
  for (let i = 0; i < W * H; i++) out[i * 4 + 3] = alphaUp.data[i]
  return { data: out, width: W, height: H } as Bitmap
}

function progressFor(id: number) {
  return (p: ProgressInfo) => {
    if (p.status === 'progress' && p.file)
      post({ id, type: 'progress', file: p.file, progress: p.progress ?? 0, loaded: p.loaded ?? 0, total: p.total ?? 0 })
  }
}

async function samEmbed(id: number, image: Bitmap, device: Device) {
  sam ??= (async () => {
    const opts = { revision: SAM_MODEL.revision, device, dtype: device === 'webgpu' ? { vision_encoder: 'fp16', prompt_encoder_mask_decoder: 'fp32' } : 'q8', progress_callback: progressFor(id) }
    const [model, processor] = await Promise.all([
      EdgeTamModel.from_pretrained(SAM_MODEL.id, opts as Parameters<typeof EdgeTamModel.from_pretrained>[1]),
      AutoProcessor.from_pretrained(SAM_MODEL.id, { revision: SAM_MODEL.revision }),
    ])
    return { model: model as EdgeTamModel, processor }
  })()
  sam.catch(() => { sam = null })
  const state = await sam
  post({ id, type: 'status', status: { key: 'segmenting' } })
  const raw = new RawImage(image.data, image.width, image.height, 4).rgb()
  const inputs = await state.processor(raw)
  state.embeddings = await state.model.get_image_embeddings(inputs)
  state.sizes = { original_sizes: inputs.original_sizes, reshaped_input_sizes: inputs.reshaped_input_sizes }
}

async function samMask(points: Point[], box: Box | null): Promise<Masks> {
  if (!sam) throw new Error('sam: no session')
  const state = await sam
  const { embeddings, sizes } = state
  if (!embeddings || !sizes) throw new Error('sam: no embeddings')
  const proc = state.processor as unknown as {
    reshape_input_points(p: number[][][], o: number[][], r: number[][], isBox?: boolean): Tensor
    post_process_masks(m: Tensor, o: number[][], r: number[][]): Promise<Tensor[]>
  }
  const inputs: Record<string, Tensor> = { ...embeddings }
  if (points.length) {
    inputs.input_points = proc.reshape_input_points([points.map((p) => [p.x, p.y])], sizes.original_sizes, sizes.reshaped_input_sizes)
    inputs.input_labels = new Tensor('int64', BigInt64Array.from(points.map((p) => BigInt(p.label))), [1, 1, points.length])
  }
  if (box) inputs.input_boxes = proc.reshape_input_points([[[box.x0, box.y0, box.x1, box.y1]]], sizes.original_sizes, sizes.reshaped_input_sizes, true)
  const out = await state.model(inputs)
  const masks = await proc.post_process_masks(out.pred_masks, sizes.original_sizes, sizes.reshaped_input_sizes)
  const m = masks[0]
  const [, count, h, w] = m.dims
  const scores = out.iou_scores.data as Float32Array
  let best = 0
  for (let i = 1; i < count; i++) if (scores[i] > scores[best]) best = i
  const src = m.data as Uint8Array
  const data = new Uint8ClampedArray(count * w * h)
  for (let i = 0; i < data.length; i++) data[i] = src[i] ? 255 : 0
  return { data, width: w, height: h, count, best }
}

// Trimap from the current alpha: confident foreground / background stay fixed,
// a band of `radius` pixels around the boundary is left for the matting model.
function trimapFrom(alpha: Uint8ClampedArray, width: number, height: number, radius: number) {
  const bin = new Uint8Array(width * height)
  for (let i = 0; i < bin.length; i++) bin[i] = alpha[i] > 127 ? 1 : 0
  const integral = new Uint32Array((width + 1) * (height + 1))
  for (let y = 1; y <= height; y++) {
    let row = 0
    for (let x = 1; x <= width; x++) {
      row += bin[(y - 1) * width + (x - 1)]
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row
    }
  }
  const tri = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.max(0, x - radius), y0 = Math.max(0, y - radius), x1 = Math.min(width, x + radius + 1), y1 = Math.min(height, y + radius + 1)
    const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0]
    const area = (x1 - x0) * (y1 - y0)
    tri[y * width + x] = sum === 0 ? 0 : sum === area ? 255 : 128
  }
  return tri
}

async function refineMatte(id: number, image: Bitmap, device: Device): Promise<Mask> {
  matte ??= (async () => {
    const opts = { revision: MATTE_MODEL.revision, device, dtype: device === 'webgpu' ? 'fp32' : 'q8', progress_callback: progressFor(id) }
    const [model, processor] = await Promise.all([
      VitMatteForImageMatting.from_pretrained(MATTE_MODEL.id, opts as Parameters<typeof VitMatteForImageMatting.from_pretrained>[1]),
      AutoProcessor.from_pretrained(MATTE_MODEL.id, { revision: MATTE_MODEL.revision }),
    ])
    return { model: model as VitMatteForImageMatting, processor }
  })()
  matte.catch(() => { matte = null })
  const { model, processor } = await matte
  post({ id, type: 'status', status: { key: 'matting' } })

  const MAX = 1024
  const scale = Math.min(1, MAX / Math.max(image.width, image.height))
  const w = Math.round(image.width * scale), h = Math.round(image.height * scale)
  const full = new RawImage(image.data, image.width, image.height, 4)
  const small = scale < 1 ? await full.resize(w, h) : full
  const alphaSmall = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) alphaSmall[i] = small.data[i * 4 + 3]
  const radius = Math.max(5, Math.round(Math.max(w, h) * 0.012))
  const tri = trimapFrom(alphaSmall, w, h, radius)
  const inputs = await processor(small.rgb(), new RawImage(tri, w, h, 1))
  const { alphas } = await model(inputs)
  const [, , ph, pw] = alphas.dims
  const out = alphas.data as Float32Array
  const matteSmall = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    matteSmall[i] = tri[i] === 255 ? 255 : tri[i] === 0 ? 0 : Math.round(Math.min(1, Math.max(0, out[y * pw + x])) * 255)
  }
  void ph
  const back = scale < 1 ? await new RawImage(matteSmall, w, h, 1).resize(image.width, image.height) : new RawImage(matteSmall, w, h, 1)
  return { data: back.data as Uint8ClampedArray, width: image.width, height: image.height }
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'detect': {
        const gpu = ctx.navigator.gpu
        const adapter = gpu ? await gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null) : null
        const runtime: Runtime = adapter
          ? {
              device: 'webgpu',
              supportsFp16: adapter.features?.has('shader-f16') ?? false,
              maxStorageBuffersPerShaderStage: adapter.limits?.maxStorageBuffersPerShaderStage ?? 0,
            }
          : { device: 'wasm', supportsFp16: false, maxStorageBuffersPerShaderStage: 0 }
        post({ id: msg.id, type: 'done', result: runtime })
        break
      }
      case 'load':
        await loadPipe(msg.id, msg.task, msg.model, msg.revision, msg.device, msg.dtype)
        post({ id: msg.id, type: 'done', result: null })
        break
      case 'removeBg': {
        const r = await removeBg(msg.id, msg.image)
        post({ id: msg.id, type: 'done', result: r }, [r.data.buffer])
        break
      }
      case 'upscale': {
        const r = await upscale(msg.id, msg.image, msg.scale)
        post({ id: msg.id, type: 'done', result: r }, [r.data.buffer])
        break
      }
      case 'samEmbed':
        await samEmbed(msg.id, msg.image, msg.device)
        post({ id: msg.id, type: 'done', result: null })
        break
      case 'samMask': {
        const r = await samMask(msg.points, msg.box)
        post({ id: msg.id, type: 'done', result: r }, [r.data.buffer])
        break
      }
      case 'matte': {
        const r = await refineMatte(msg.id, msg.image, msg.device)
        post({ id: msg.id, type: 'done', result: r }, [r.data.buffer])
        break
      }
    }
  } catch (err) {
    // A lost device takes every session with it, not just the one that was running.
    if (isGpuLost(err)) evictAll()
    else if (isGpuLimit(err)) evict(msg.type)
    post({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

// A session that blew the GPU limits is useless: drop it so the next call reloads
// the model on the device the client picks instead.
function evict(type: Request['type']) {
  if (type === 'removeBg' || type === 'load') {
    dropCached(current.bg)
    dropCached(current.sr)
    current.bg = current.sr = null
  } else if (type === 'upscale') {
    dropCached(current.sr)
    current.sr = null
  } else if (type === 'samEmbed' || type === 'samMask') { release(sam); sam = null }
  else if (type === 'matte') { release(matte); matte = null }
}

function evictAll() {
  for (const k of cache.keys()) dropCached(k)
  current.bg = current.sr = null
  release(sam)
  release(matte)
  sam = matte = null
}
