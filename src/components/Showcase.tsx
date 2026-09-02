import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'

interface Specimen {
  src: string
  model: string
  tag: 'hair' | 'mesh' | 'fineEdges' | 'fur' | 'whiskers' | 'upscaled'
  className: string
  tilt: number
  depth: number
  delay: number
}

const base = import.meta.env.BASE_URL

const SPECIMENS: Specimen[] = [
  { src: `${base}showcase/portrait.webp`, model: 'BiRefNet Lite', tag: 'hair', className: 'w-28 lg:w-36 lg:-left-14 lg:-top-16', tilt: -7, depth: 1.2, delay: 0 },
  { src: `${base}showcase/camera.webp`, model: 'Swin2SR', tag: 'upscaled', className: 'w-28 lg:w-32 lg:-right-16 lg:-top-14', tilt: 5, depth: 0.7, delay: 1.1 },
  { src: `${base}showcase/cat.webp`, model: 'BEN2', tag: 'fur', className: 'w-24 lg:w-28 lg:-left-12 lg:-bottom-6', tilt: 4, depth: 0.9, delay: 2.3 },
  { src: `${base}showcase/nina.webp`, model: 'BEN2', tag: 'whiskers', className: 'w-24 lg:w-24 lg:-left-28 lg:top-[36%]', tilt: -3, depth: 1.1, delay: 3.1 },
  { src: `${base}showcase/fern.webp`, model: 'BiRefNet', tag: 'fineEdges', className: 'w-32 lg:w-40 lg:-right-20 lg:-bottom-20', tilt: -4, depth: 1.4, delay: 0.6 },
  { src: `${base}showcase/shoe.webp`, model: 'MODNet', tag: 'mesh', className: 'w-32 lg:w-36 lg:bottom-[-5.5rem] lg:left-[38%]', tilt: 2, depth: 0.5, delay: 1.7 },
]

export function Showcase() {
  const { t } = useI18n()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current!
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        el.style.setProperty('--px', `${((e.clientX - r.left) / r.width - 0.5) * 2}`)
        el.style.setProperty('--py', `${((e.clientY - r.top) / r.height - 0.5) * 2}`)
      })
    }
    const onLeave = () => { el.style.setProperty('--px', '0'); el.style.setProperty('--py', '0') }
    const scope = el.closest('main') ?? el
    scope.addEventListener('pointermove', onMove)
    scope.addEventListener('pointerleave', onLeave)
    return () => { scope.removeEventListener('pointermove', onMove); scope.removeEventListener('pointerleave', onLeave); cancelAnimationFrame(frame) }
  }, [])

  return (
    <div ref={root} className="pointer-events-none flex w-full max-w-full gap-3 overflow-x-auto px-1 pb-2 pt-4 lg:contents" aria-label={t.showcase.label} role="group">
      {SPECIMENS.map((s, i) => (
        <figure
          key={s.src}
          className={`specimen shrink-0 lg:absolute ${s.className}`}
          style={{ ['--tilt' as string]: `${s.tilt}deg`, ['--depth' as string]: s.depth, animationDelay: `${s.delay}s` } as React.CSSProperties}
        >
          <div className="specimen-card rounded-xl border border-line bg-panel p-1.5 shadow-[0_24px_50px_-28px_rgba(0,0,0,.45)]">
            <div className="checker overflow-hidden rounded-lg">
              <img src={s.src} alt={t.showcase.alt(s.model)} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" className="block max-h-40 w-full object-contain p-1 lg:max-h-48" />
            </div>
            <figcaption className="mt-1.5 flex items-center justify-between gap-2 px-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-dim">
              <span className="truncate">{s.model}</span>
              <span className="shrink-0 text-accent">{t.showcase.tags[s.tag]}</span>
            </figcaption>
          </div>
        </figure>
      ))}
    </div>
  )
}
