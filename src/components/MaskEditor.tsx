import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Eraser, Paintbrush, Undo2, X } from 'lucide-react'
import type { Bitmap } from '../lib/worker'
import { toCanvas } from '../lib/image'
import { useI18n } from '../i18n'

interface Props {
  bitmap: Bitmap
  source: Bitmap | null
  onCancel: () => void
  onApply: (result: Bitmap) => void
}

type Mode = 'erase' | 'restore'
const MAX_UNDO = 6

export function MaskEditor({ bitmap, source, onCancel, onApply }: Props) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null)
  const undo = useRef<ImageData[]>([])
  const last = useRef<{ x: number; y: number } | null>(null)
  const [mode, setMode] = useState<Mode>('erase')
  const [size, setSize] = useState(Math.max(12, Math.round(Math.max(bitmap.width, bitmap.height) / 30)))
  const [softness, setSoftness] = useState(0.5)
  const [zoom, setZoom] = useState(1)
  const [strokes, setStrokes] = useState(0)
  const canRestore = !!source && source.width === bitmap.width && source.height === bitmap.height

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(bitmap.data as Uint8ClampedArray<ArrayBuffer>, bitmap.width, bitmap.height), 0, 0)
    sourceCanvas.current = canRestore ? toCanvas(source!) : null
    undo.current = []
  }, [bitmap, source, canRestore])

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
    grad.addColorStop(0, 'rgba(0,0,0,1)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return b
  }

  const dab = (ctx: CanvasRenderingContext2D, b: HTMLCanvasElement, x: number, y: number) => {
    const r = size / 2
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

  const onDown = (e: ReactPointerEvent) => {
    if (mode === 'restore' && !canRestore) return
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!
    undo.current.push(ctx.getImageData(0, 0, bitmap.width, bitmap.height))
    if (undo.current.length > MAX_UNDO) undo.current.shift()
    e.currentTarget.setPointerCapture(e.pointerId)
    last.current = null
    paint(e)
  }
  const onMove = (e: ReactPointerEvent) => {
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
  const onUp = () => {
    if (last.current) setStrokes((n) => n + 1)
    last.current = null
  }
  const undoStroke = () => {
    const prev = undo.current.pop()
    if (!prev) return
    canvasRef.current!.getContext('2d', { willReadFrequently: true })!.putImageData(prev, 0, 0)
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
          {modeBtn('erase', <Eraser className="size-3.5" />, t.retouch.erase)}
          {modeBtn('restore', <Paintbrush className="size-3.5" />, t.retouch.restore, !canRestore)}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t.retouch.size}
          <input type="range" min={4} max={Math.max(40, Math.round(Math.max(bitmap.width, bitmap.height) / 6))} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-accent-solid" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t.retouch.softness}
          <input type="range" min={0} max={0.9} step={0.05} value={softness} onChange={(e) => setSoftness(Number(e.target.value))} className="w-20 accent-accent-solid" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t.crop.zoom}
          <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20 accent-accent-solid" />
        </label>
        <button type="button" onClick={undoStroke} disabled={strokes === 0} aria-label={t.tool.undo} className="rounded-md p-1.5 hover:bg-line disabled:opacity-40"><Undo2 className="size-4" /></button>
        <button type="button" onClick={onCancel} className="ml-auto rounded-md p-1.5 hover:bg-line" aria-label={t.crop.close}><X className="size-5" /></button>
      </header>
      <p className="border-b border-line px-4 py-1.5 text-xs text-muted">{mode === 'erase' ? t.retouch.eraseHint : t.retouch.restoreHint}</p>
      <div className="checker relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 [container-type:size]" onPointerMove={onMove} onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.opacity = '0' }}>
        <div style={{ width: `calc(min(100cqw - 2rem, (100cqh - 2rem) * ${bitmap.width / bitmap.height}) * ${zoom})`, aspectRatio: `${bitmap.width} / ${bitmap.height}`, margin: 'auto' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="block size-full cursor-none touch-none shadow-2xl shadow-black/30"
          />
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
