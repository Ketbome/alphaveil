import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Eraser, Loader2, MousePointerClick, Paintbrush, Sparkles, Undo2, WandSparkles, X } from 'lucide-react'
import type { Bitmap, Box, Mask, Masks, Point } from '../lib/worker'
import { inspectAlpha, toCanvas } from '../lib/image'
import { useI18n } from '../i18n'

interface Props {
  bitmap: Bitmap
  source: Bitmap | null
  onCancel: () => void
  onApply: (result: Bitmap) => void
  onDetect: (crop: Bitmap) => Promise<Bitmap>
  onSamEmbed: (image: Bitmap) => Promise<void>
  onSamMask: (points: Point[], box: Box | null) => Promise<Masks>
  onMatte: (image: Bitmap) => Promise<Mask>
  initialMode?: Mode
}

export type Mode = 'erase' | 'restore' | 'detect' | 'select'
const MAX_UNDO = 6
// Every snapshot is a full copy of the image: six of them on a 2880 px photo is
// 124 MB, enough to take the tab down on its own. Bytes decide, the count is the cap.
const MAX_UNDO_BYTES = 64 * 1024 * 1024

export function MaskEditor({ bitmap, source, onCancel, onApply, onDetect, onSamEmbed, onSamMask, onMatte, initialMode }: Props) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const regionRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const opaque = !inspectAlpha(bitmap).transparent
  const [mode, setMode] = useState<Mode>(initialMode ?? (opaque ? 'select' : 'erase'))
  const [points, setPoints] = useState<Point[]>([])
  const [positive, setPositive] = useState(true)
  const [box, setBox] = useState<Box | null>(null)
  const [drag, setDrag] = useState<Box | null>(null)
  const dragFrom = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null)
  const [masks, setMasks] = useState<Masks | null>(null)
  const [variant, setVariant] = useState(0)
  const [embedding, setEmbedding] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [failed, setFailed] = useState(false)
  const [refining, setRefining] = useState(false)
  const [runFailed, setRunFailed] = useState(false)
  const embedded = useRef(false)
  const [undone, setUndone] = useState<{ of: Bitmap; steps: ImageData[] }>({ of: bitmap, steps: [] })
  const [hasRegion, setHasRegion] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [size, setSize] = useState(Math.max(12, Math.round(Math.max(bitmap.width, bitmap.height) / 30)))
  const [softness, setSoftness] = useState(0.5)
  const [smart, setSmart] = useState(true)
  const [tolerance, setTolerance] = useState(30)
  const ref = useRef<[number, number, number] | null>(null)
  const sourceData = useRef<Uint8ClampedArray | null>(null)
  const [zoom, setZoom] = useState(1)
  const [strokes, setStrokes] = useState(0)
  const canRestore = !!source && source.width === bitmap.width && source.height === bitmap.height

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(bitmap.data as Uint8ClampedArray<ArrayBuffer>, bitmap.width, bitmap.height), 0, 0)
    sourceCanvas.current = canRestore ? toCanvas(source!) : null
    sourceData.current = canRestore ? source!.data : bitmap.data
    const region = regionRef.current!
    region.width = bitmap.width
    region.height = bitmap.height
  }, [bitmap, source, canRestore])

  // The snapshots belong to the bitmap they were taken from, so another one starts
  // over. Past MAX_UNDO the oldest is dropped, which is why the buttons watch the
  // stack itself: how many edits were applied says nothing about what can be undone.
  const undoable = undone.of === bitmap ? undone.steps : []
  const snapshots = Math.max(1, Math.min(MAX_UNDO, Math.floor(MAX_UNDO_BYTES / (bitmap.width * bitmap.height * 4))))
  const pushUndo = (img: ImageData) => setUndone({ of: bitmap, steps: [...undoable, img].slice(-snapshots) })

  useEffect(() => {
    if (mode !== 'select' || embedded.current) return
    embedded.current = true
    setEmbedding('loading')
    const src = sourceData.current ?? bitmap.data
    onSamEmbed({ data: src, width: bitmap.width, height: bitmap.height }).then(() => setEmbedding('ready')).catch(() => { embedded.current = false; setEmbedding('idle') })
  }, [mode, bitmap, onSamEmbed])

  useEffect(() => {
    const overlay = regionRef.current
    if (!overlay) return
    const rc = overlay.getContext('2d', { willReadFrequently: true })!
    if (mode !== 'select') return
    rc.clearRect(0, 0, bitmap.width, bitmap.height)
    if (!masks) return
    const plane = masks.width * masks.height
    const off = Math.min(variant, masks.count - 1) * plane
    const img = rc.createImageData(bitmap.width, bitmap.height)
    for (let i = 0; i < plane; i++) {
      if (!masks.data[off + i]) continue
      const o = i * 4
      img.data[o] = 223; img.data[o + 1] = 122; img.data[o + 2] = 68; img.data[o + 3] = 255
    }
    rc.putImageData(img, 0, 0)
  }, [masks, variant, mode, bitmap])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const brush = () => {
    const r = size / 2
    const b = document.createElement('canvas')
    b.width = b.height = size
    const g = b.getContext('2d', { willReadFrequently: true })!
    const grad = g.createRadialGradient(r, r, r * (1 - softness), r, r, r)
    const tint = mode === 'detect' ? '223,122,68' : '0,0,0'
    grad.addColorStop(0, `rgba(${tint},1)`)
    grad.addColorStop(1, `rgba(${tint},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return Object.assign(b, { alpha: g.getImageData(0, 0, size, size).data })
  }

  // Erase only pixels whose original color is close to the color sampled where
  // the stroke started, so a rough stroke along the subject does not eat into it.
  const smartErase = (ctx: CanvasRenderingContext2D, b: HTMLCanvasElement & { alpha: Uint8ClampedArray }, x: number, y: number) => {
    const src = sourceData.current!
    const r = size / 2
    const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r))
    const w = Math.min(size, bitmap.width - x0), h = Math.min(size, bitmap.height - y0)
    if (w <= 0 || h <= 0) return
    const img = ctx.getImageData(x0, y0, w, h)
    const [rr, rg, rb] = ref.current!
    const tol = tolerance * 2.5
    const feather = Math.max(8, tol * 0.4)
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const bi = ((py + y0 - Math.round(y - r)) * size + (px + x0 - Math.round(x - r))) * 4 + 3
      const bw = (b.alpha[bi] ?? 0) / 255
      if (bw === 0) continue
      const si = ((py + y0) * bitmap.width + (px + x0)) * 4
      const d = Math.hypot(src[si] - rr, src[si + 1] - rg, src[si + 2] - rb)
      const k = Math.min(1, Math.max(0, (tol + feather - d) / feather))
      if (k === 0) continue
      const i = (py * w + px) * 4 + 3
      img.data[i] = Math.round(img.data[i] * (1 - bw * k))
    }
    ctx.putImageData(img, x0, y0)
  }

  const dab = (ctx: CanvasRenderingContext2D, b: HTMLCanvasElement & { alpha: Uint8ClampedArray }, x: number, y: number) => {
    const r = size / 2
    if (mode === 'erase' && smart && ref.current) return smartErase(ctx, b, x, y)
    if (mode === 'detect') {
      const rc = regionRef.current!.getContext('2d', { willReadFrequently: true })!
      rc.globalCompositeOperation = 'source-over'
      rc.drawImage(b, x - r, y - r)
      return
    }
    if (mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.drawImage(b, x - r, y - r)
    } else if (sourceCanvas.current) {
      const tmp = document.createElement('canvas')
      tmp.width = tmp.height = size
      const tc = tmp.getContext('2d', { willReadFrequently: true })!
      tc.drawImage(sourceCanvas.current, x - r, y - r, size, size, 0, 0, size, size)
      tc.globalCompositeOperation = 'destination-in'
      tc.drawImage(b, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(tmp, x - r, y - r)
    }
  }

  const toImage = (e: ReactPointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * bitmap.width, y: ((e.clientY - rect.top) / rect.height) * bitmap.height }
  }

  const paint = (e: ReactPointerEvent) => {
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!
    const b = brush()
    const p = toImage(e)
    const from = last.current ?? p
    const dist = Math.hypot(p.x - from.x, p.y - from.y)
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, size / 4)))
    for (let i = 1; i <= steps; i++) dab(ctx, b, from.x + ((p.x - from.x) * i) / steps, from.y + ((p.y - from.y) * i) / steps)
    last.current = p
  }

  const prompt = async (nextPoints: Point[], nextBox: Box | null) => {
    setPoints(nextPoints)
    setBox(nextBox)
    if (!nextPoints.length && !nextBox) { setMasks(null); return }
    setFailed(false)
    try {
      const m = await onSamMask(nextPoints, nextBox)
      setMasks(m)
      setVariant(m.best)
    } catch {
      // The session is gone and could not be rebuilt: drop the embedding so coming
      // back to this tool loads the model again instead of failing on every click.
      embedded.current = false
      setEmbedding('idle')
      setMasks(null)
      setFailed(true)
    }
  }

  const addPoint = (e: ReactPointerEvent) => {
    const p = toImage(e)
    return prompt([...points, { x: Math.round(p.x), y: Math.round(p.y), label: (e.altKey ? !positive : positive) ? 1 : 0 } as Point], box)
  }

  const clearPrompt = () => { setPoints([]); setBox(null); setMasks(null); setFailed(false) }

  const selected = (): Mask | null => {
    if (!masks) return null
    const plane = masks.width * masks.height
    const off = Math.min(variant, masks.count - 1) * plane
    return { data: masks.data.subarray(off, off + plane), width: masks.width, height: masks.height }
  }

  const feathered = (m: Mask) => {
    // 3x3 box blur twice: softens the hard SAM edge by ~1.5 px
    const { width: w, height: h } = m
    let a = m.data
    for (let pass = 0; pass < 2; pass++) {
      const b = new Uint8ClampedArray(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let sum = 0, n = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
          sum += a[yy * w + xx]; n++
        }
        b[y * w + x] = Math.round(sum / n)
      }
      a = b
    }
    return a
  }

  const applyMask = (op: 'keep' | 'remove' | 'add') => {
    const mask = selected()
    if (!mask) return
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!
    pushUndo(ctx.getImageData(0, 0, bitmap.width, bitmap.height))
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    const m = feathered(mask)
    const src = sourceData.current
    for (let i = 0; i < m.length; i++) {
      const o = i * 4 + 3
      const k = m[i] / 255
      if (op === 'remove') {
        img.data[o] = Math.round(img.data[o] * (1 - k))
        continue
      }
      // Add keeps whatever is already opaque and brings the selection back on top,
      // so a part the model cut off returns without touching the rest of the cutout.
      if (op === 'add' && k === 0) continue
      const a = Math.round(k * 255)
      img.data[o] = op === 'add' ? Math.max(img.data[o], a) : a
      if (src && k > 0) { img.data[o - 3] = src[o - 3]; img.data[o - 2] = src[o - 2]; img.data[o - 1] = src[o - 1] }
    }
    ctx.putImageData(img, 0, 0)
    setStrokes((n) => n + 1)
    clearPrompt()
  }

  const refine = async () => {
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    const rgb = sourceData.current
    const input = new Uint8ClampedArray(img.data)
    if (rgb) for (let i = 0; i < input.length; i += 4) { input[i] = rgb[i]; input[i + 1] = rgb[i + 1]; input[i + 2] = rgb[i + 2] }
    setRefining(true)
    setRunFailed(false)
    try {
      const m = await onMatte({ data: input, width: bitmap.width, height: bitmap.height })
      pushUndo(img)
      const next = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      for (let i = 0; i < m.data.length; i++) next.data[i * 4 + 3] = m.data[i]
      ctx.putImageData(next, 0, 0)
      setStrokes((n) => n + 1)
    } catch {
      setRunFailed(true)
    } finally {
      setRefining(false)
    }
  }

  const onDown = (e: ReactPointerEvent) => {
    if (mode === 'select') {
      if (embedding !== 'ready') return
      e.currentTarget.setPointerCapture(e.pointerId)
      const p = toImage(e)
      dragFrom.current = { ...p, clientX: e.clientX, clientY: e.clientY }
      return
    }
    if (mode === 'restore' && !canRestore) return
    if (mode !== 'detect') {
      const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!
      pushUndo(ctx.getImageData(0, 0, bitmap.width, bitmap.height))
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    last.current = null
    if (mode === 'erase' && smart) {
      const p = toImage(e)
      const i = (Math.min(bitmap.height - 1, Math.max(0, Math.round(p.y))) * bitmap.width + Math.min(bitmap.width - 1, Math.max(0, Math.round(p.x)))) * 4
      const src = sourceData.current!
      ref.current = [src[i], src[i + 1], src[i + 2]]
    }
    paint(e)
  }
  const onMove = (e: ReactPointerEvent) => {
    const from = dragFrom.current
    if (mode === 'select') {
      if (!from || !e.buttons) return
      if (Math.hypot(e.clientX - from.clientX, e.clientY - from.clientY) < 6) return
      const p = toImage(e)
      setDrag({ x0: Math.min(from.x, p.x), y0: Math.min(from.y, p.y), x1: Math.max(from.x, p.x), y1: Math.max(from.y, p.y) })
      return
    }
    const c = cursorRef.current
    if (c) {
      const rect = canvasRef.current!.getBoundingClientRect()
      const px = (size * rect.width) / bitmap.width
      c.style.width = c.style.height = `${px}px`
      c.style.transform = `translate(${e.clientX - px / 2}px, ${e.clientY - px / 2}px)`
      c.style.opacity = '1'
    }
    if (e.buttons && last.current !== null) paint(e)
  }
  const onUp = (e: ReactPointerEvent) => {
    if (mode === 'select') {
      const started = dragFrom.current
      dragFrom.current = null
      if (!started) return
      if (drag) { const b = drag; setDrag(null); void prompt(points, b) }
      else void addPoint(e)
      return
    }
    if (last.current) {
      if (mode === 'detect') setHasRegion(true)
      else setStrokes((n) => n + 1)
    }
    last.current = null
  }

  const clearRegion = () => {
    regionRef.current!.getContext('2d', { willReadFrequently: true })!.clearRect(0, 0, bitmap.width, bitmap.height)
    setHasRegion(false)
  }

  // Run the model on the bounding box of the painted region (padded), then blend
  // the new alpha into the current one using the brush mask as the weight.
  const detect = async () => {
    const { width, height } = bitmap
    const region = regionRef.current!.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data
    let x0 = width, y0 = height, x1 = -1, y1 = -1
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (region[(y * width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    }
    if (x1 < 0) return
    const padX = Math.max(Math.round((x1 - x0) * 0.35), Math.round(width * 0.2))
    const padY = Math.max(Math.round((y1 - y0) * 0.35), Math.round(height * 0.2))
    x0 = Math.max(0, x0 - padX); y0 = Math.max(0, y0 - padY); x1 = Math.min(width - 1, x1 + padX); y1 = Math.min(height - 1, y1 + padY)
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!
    const current = ctx.getImageData(0, 0, width, height)
    const rgbSource = sourceCanvas.current ? sourceCanvas.current.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data : current.data
    const crop = new Uint8ClampedArray(cw * ch * 4)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const si = ((y + y0) * width + (x + x0)) * 4, di = (y * cw + x) * 4
      crop[di] = rgbSource[si]; crop[di + 1] = rgbSource[si + 1]; crop[di + 2] = rgbSource[si + 2]; crop[di + 3] = 255
    }
    setDetecting(true)
    setRunFailed(false)
    try {
      const out = await onDetect({ data: crop, width: cw, height: ch })
      pushUndo(ctx.getImageData(0, 0, width, height))
      const next = current
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const i = ((y + y0) * width + (x + x0)) * 4
        const m = region[i + 3] / 255
        if (m === 0) continue
        const a = out.data[(y * cw + x) * 4 + 3]
        next.data[i + 3] = Math.round(next.data[i + 3] * (1 - m) + a * m)
        if (m > 0.5) { next.data[i] = rgbSource[i]; next.data[i + 1] = rgbSource[i + 1]; next.data[i + 2] = rgbSource[i + 2] }
      }
      ctx.putImageData(next, 0, 0)
      setStrokes((n) => n + 1)
      clearRegion()
    } catch {
      setRunFailed(true)
    } finally {
      setDetecting(false)
    }
  }
  const undoStroke = () => {
    const prev = undoable.at(-1)
    if (!prev) return
    canvasRef.current!.getContext('2d', { willReadFrequently: true })!.putImageData(prev, 0, 0)
    setUndone({ of: bitmap, steps: undoable.slice(0, -1) })
    setStrokes((n) => Math.max(0, n - 1))
  }
  const apply = () => {
    const { data } = canvasRef.current!.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, bitmap.width, bitmap.height)
    onApply({ data, width: bitmap.width, height: bitmap.height })
  }

  const modeBtn = (m: Mode, icon: React.ReactNode, label: string, disabled = false) => (
    <button type="button" role="radio" aria-checked={mode === m} disabled={disabled} onClick={() => setMode(m)}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs disabled:opacity-40 ${mode === m ? 'bg-accent-solid font-semibold text-on-accent' : 'text-fg/80 hover:bg-line'}`}>
      {icon}{label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur" role="dialog" aria-modal="true" aria-label={t.retouch.title}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <div className="mr-2 font-medium">{t.retouch.title}</div>
        <div className="flex items-center gap-0.5 rounded-lg bg-panel p-1" role="radiogroup">
          {modeBtn('select', <MousePointerClick className="size-3.5" />, t.retouch.select)}
          {modeBtn('erase', <Eraser className="size-3.5" />, t.retouch.erase)}
          {modeBtn('restore', <Paintbrush className="size-3.5" />, t.retouch.restore, !canRestore)}
          {modeBtn('detect', <WandSparkles className="size-3.5" />, t.retouch.detect)}
        </div>
        <button type="button" onClick={refine} disabled={refining || opaque && strokes === 0} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold hover:bg-line disabled:opacity-40" title={t.retouch.refineHint}>
          {refining ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}{refining ? t.busy.matting : t.retouch.refine}
        </button>
        {mode !== 'select' && (<>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t.retouch.size}
          <input type="range" min={4} max={Math.max(40, Math.round(Math.max(bitmap.width, bitmap.height) / 6))} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-accent-solid" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t.retouch.softness}
          <input type="range" min={0} max={0.9} step={0.05} value={softness} onChange={(e) => setSoftness(Number(e.target.value))} className="w-20 accent-accent-solid" />
        </label>
        </>)}
        {mode === 'erase' && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)} className="accent-accent-solid" />
              {t.retouch.smart}
            </label>
            {smart && (
              <label className="flex items-center gap-2 text-xs text-muted">
                {t.retouch.tolerance}
                <input type="range" min={5} max={80} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-20 accent-accent-solid" />
              </label>
            )}
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-muted">
          {t.crop.zoom}
          <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20 accent-accent-solid" />
        </label>
        <button type="button" onClick={undoStroke} disabled={!undoable.length} aria-label={t.tool.undo} className="rounded-md p-1.5 hover:bg-line disabled:opacity-40"><Undo2 className="size-4" /></button>
        <button type="button" onClick={onCancel} className="ml-auto rounded-md p-1.5 hover:bg-line" aria-label={t.crop.close}><X className="size-5" /></button>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-1.5">
        <p className={`text-xs ${runFailed || (failed && mode === 'select') ? 'text-danger' : 'text-muted'}`}>{runFailed ? t.retouch.runFailed : mode === 'select' ? (failed ? t.retouch.selectFailed : embedding === 'loading' ? t.retouch.analyzing : t.retouch.selectHint) : mode === 'erase' ? (smart ? t.retouch.smartHint : t.retouch.eraseHint) : mode === 'restore' ? t.retouch.restoreHint : t.retouch.detectHint}</p>
        {mode === 'select' && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-0.5 rounded-md bg-panel p-0.5" role="radiogroup" aria-label={t.retouch.pointType}>
              <button type="button" role="radio" aria-checked={positive} onClick={() => setPositive(true)} className={`rounded px-2 py-1 text-xs ${positive ? 'bg-accent-solid font-semibold text-on-accent' : 'hover:bg-line'}`}>{t.retouch.include}</button>
              <button type="button" role="radio" aria-checked={!positive} onClick={() => setPositive(false)} className={`rounded px-2 py-1 text-xs ${!positive ? 'bg-accent-solid font-semibold text-on-accent' : 'hover:bg-line'}`}>{t.retouch.exclude}</button>
            </span>
            {masks && masks.count > 1 && (
              <span className="flex items-center gap-1 text-xs text-muted">
                {t.retouch.shape}
                <span className="flex items-center gap-0.5 rounded-md bg-panel p-0.5" role="radiogroup" aria-label={t.retouch.shape}>
                  {Array.from({ length: masks.count }, (_, i) => (
                    <button key={i} type="button" role="radio" aria-checked={variant === i} onClick={() => setVariant(i)}
                      className={`rounded px-2 py-1 font-mono text-xs ${variant === i ? 'bg-accent-solid font-semibold text-on-accent' : 'hover:bg-line'}`}>{i + 1}</button>
                  ))}
                </span>
              </span>
            )}
            <button type="button" onClick={clearPrompt} disabled={!points.length && !box} className="rounded-md px-2 py-1 text-xs hover:bg-line disabled:opacity-40">{t.retouch.clearPoints}</button>
            <button type="button" onClick={() => applyMask('remove')} disabled={!masks} className="rounded-md border border-line px-3 py-1 text-xs font-semibold hover:bg-line disabled:opacity-40">{t.retouch.removeThis}</button>
            <button type="button" onClick={() => applyMask('add')} disabled={!masks || !canRestore} title={t.retouch.addThisHint} className="rounded-md border border-line px-3 py-1 text-xs font-semibold hover:bg-line disabled:opacity-40">{t.retouch.addThis}</button>
            <button type="button" onClick={() => applyMask('keep')} disabled={!masks} className="rounded-md bg-accent-solid px-3 py-1 text-xs font-semibold text-on-accent disabled:opacity-40">{t.retouch.keepThis}</button>
          </span>
        )}
        {mode === 'detect' && (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={clearRegion} disabled={!hasRegion || detecting} className="rounded-md px-2 py-1 text-xs hover:bg-line disabled:opacity-40">{t.retouch.clear}</button>
            <button type="button" onClick={detect} disabled={!hasRegion || detecting} className="flex items-center gap-1.5 rounded-md bg-accent-solid px-3 py-1 text-xs font-semibold text-on-accent disabled:opacity-40">
              {detecting ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}{detecting ? t.retouch.running : t.retouch.run}
            </button>
          </span>
        )}
      </div>
      <div className="checker relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 [container-type:size]" onPointerMove={onMove} onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.opacity = '0' }}>
        <div style={{ width: `calc(min(100cqw - 2rem, (100cqh - 2rem) * ${bitmap.width / bitmap.height}) * ${zoom})`, aspectRatio: `${bitmap.width} / ${bitmap.height}`, margin: 'auto' }}>
          <div className="relative size-full">
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className={`block size-full touch-none shadow-2xl shadow-black/30 ${mode === 'select' ? 'cursor-crosshair' : 'cursor-none'}`}
            />
            <canvas ref={regionRef} aria-hidden="true" className={`region-overlay pointer-events-none absolute inset-0 size-full ${mode === 'detect' ? 'opacity-60' : mode === 'select' ? 'opacity-45' : 'opacity-0'}`} />
            {mode === 'select' && (drag ?? box) && (() => {
              const b = (drag ?? box)!
              return <span aria-hidden="true" className="pointer-events-none absolute rounded-sm border-2 border-dashed border-accent-solid bg-accent/10"
                style={{ left: `${(b.x0 / bitmap.width) * 100}%`, top: `${(b.y0 / bitmap.height) * 100}%`, width: `${((b.x1 - b.x0) / bitmap.width) * 100}%`, height: `${((b.y1 - b.y0) / bitmap.height) * 100}%` }} />
            })()}
            {mode === 'select' && points.map((p, i) => (
              <span key={i} aria-hidden="true" className={`pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${p.label ? 'bg-accent-solid' : 'bg-danger'}`} style={{ left: `${(p.x / bitmap.width) * 100}%`, top: `${(p.y / bitmap.height) * 100}%` }} />
            ))}
            {mode === 'select' && embedding === 'loading' && (
              <div className="absolute inset-0 grid place-items-center bg-ink/50"><Loader2 className="size-8 animate-spin text-accent" /></div>
            )}
          </div>
        </div>
      </div>
      <div ref={cursorRef} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[60] rounded-full border-2 border-accent-solid opacity-0 mix-blend-difference" />
      <footer className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
        <button type="button" onClick={onCancel} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-line sm:px-4">{t.crop.cancel}</button>
        <button type="button" onClick={apply} disabled={strokes === 0} className="whitespace-nowrap rounded-lg bg-accent-solid px-3 py-2 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-40 sm:px-4">{t.retouch.apply}</button>
      </footer>
    </div>
  )
}
