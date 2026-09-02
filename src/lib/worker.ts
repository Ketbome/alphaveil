import { env, pipeline, AutoModel, AutoProcessor, RawImage, type PreTrainedModel, type Processor, type Tensor } from '@huggingface/transformers'
import type { Device, Runtime } from './models'

env.allowLocalModels = false

export type Status = { key: 'segmenting' } | { key: 'upscaling'; done: number; total: number }

export interface Bitmap {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type Request =
  | { id: number; type: 'detect' }
  | { id: number; type: 'load'; task: 'bg' | 'sr'; model: string; revision: string; device: Device; dtype: string }
  | { id: number; type: 'removeBg'; image: Bitmap }
  | { id: number; type: 'upscale'; image: Bitmap; scale: number }

export type Response =
  | { id: number; type: 'progress'; file: string; progress: number; loaded: number; total: number }
  | { id: number; type: 'status'; status: Status }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; message: string }

type Pipe = Awaited<ReturnType<typeof pipeline>>
type Segmenter = { model: PreTrainedModel; processor: Processor }

const cache = new Map<string, Promise<Pipe | Segmenter>>()
const current: Record<'bg' | 'sr', string | null> = { bg: null, sr: null }

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
    }
  } catch (err) {
    post({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
