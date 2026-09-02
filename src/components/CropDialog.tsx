import { useState, useCallback, useEffect } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { X } from 'lucide-react'
import { useI18n } from '../i18n'

const RATIOS: { label: string; value: number | undefined }[] = [
  { label: 'free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
]

interface Props {
  src: string
  onCancel: () => void
  onApply: (area: Area) => void
}

export function CropDialog({ src, onCancel, onApply }: Props) {
  const { t } = useI18n()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [ratio, setRatio] = useState<number | undefined>(undefined)
  const [area, setArea] = useState<Area | null>(null)
  const onComplete = useCallback((_: Area, px: Area) => setArea(px), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur" role="dialog" aria-modal="true" aria-label={t.crop.title}>
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="font-medium">{t.crop.title}</div>
        <div className="flex items-center gap-1 rounded-lg bg-panel p-1" role="radiogroup">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              role="radio"
              aria-checked={ratio === r.value}
              onClick={() => setRatio(r.value)}
              className={`rounded-md px-2.5 py-1 text-xs ${ratio === r.value ? 'bg-accent-solid text-on-accent font-semibold' : 'text-fg/80 hover:bg-line'}`}
            >
              {r.label === 'free' ? t.crop.free : r.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onCancel} className="rounded-md p-1.5 hover:bg-line" aria-label={t.crop.close}>
          <X className="size-5" />
        </button>
      </header>
      <div className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={ratio}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onComplete}
          objectFit="contain"
          showGrid
        />
      </div>
      <footer className="flex items-center gap-4 border-t border-line px-4 py-3">
        <label className="flex flex-1 items-center gap-3 text-sm text-muted">
          {t.crop.zoom}
          <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-accent-solid" />
        </label>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm hover:bg-line">{t.crop.cancel}</button>
        <button
          type="button"
          onClick={() => area && onApply(area)}
          className="rounded-lg bg-accent-solid px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110"
        >
          {t.crop.apply}
        </button>
      </footer>
    </div>
  )
}
