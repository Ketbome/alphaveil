import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Bitmap } from '../lib/worker'
import { useI18n } from '../i18n'

function Layer({ bitmap, className, style }: { bitmap: Bitmap; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.putImageData(new ImageData(bitmap.data as Uint8ClampedArray<ArrayBuffer>, bitmap.width, bitmap.height), 0, 0)
  }, [bitmap])
  return <canvas ref={ref} className={className} style={style} />
}

export function CompareView({ before, after }: { before: Bitmap; after: Bitmap }) {
  const { t } = useI18n()
  const [pos, setPos] = useState(50)
  const [sweeping, setSweeping] = useState(true)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setTimeout(() => setSweeping(false), 1600)
    return () => clearTimeout(id)
  }, [])

  const update = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setSweeping(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    update(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.buttons) update(e.clientX)
  }

  const ratio = Math.max(before.width / before.height, after.width / after.height)

  return (
    <div
      ref={box}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      className="compare relative max-h-full max-w-full touch-none select-none overflow-hidden rounded-md shadow-2xl shadow-black/30"
      style={{ aspectRatio: `${ratio}`, width: 'min(100%, calc((100dvh - 14rem) * ' + ratio + '))', ['--pos' as string]: `${pos}%` }}
    >
      <Layer bitmap={after} className="absolute inset-0 size-full object-contain" />
      <Layer bitmap={before} className={`absolute inset-0 size-full object-contain ${sweeping ? 'compare-sweep' : ''}`} style={{ clipPath: 'inset(0 calc(100% - var(--pos)) 0 0)' }} />
      <div className={`pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent-solid shadow-[0_0_0_1px_rgba(0,0,0,.35)] ${sweeping ? 'compare-sweep' : ''}`} style={{ left: 'var(--pos)' }}>
        <span className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-accent-solid bg-ink/90 text-accent shadow-lg">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-5 6 5 6M15 6l5 6-5 6" /></svg>
        </span>
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-ink/80 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fg backdrop-blur">{t.compare.before}</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-accent-solid px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-on-accent">{t.compare.after}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => { setSweeping(false); setPos(Number(e.target.value)) }}
        aria-label={t.compare.hint}
        className="absolute inset-x-0 bottom-0 h-8 w-full cursor-ew-resize opacity-0 focus-visible:opacity-100"
      />
    </div>
  )
}
