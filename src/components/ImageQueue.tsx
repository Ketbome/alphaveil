import { Archive, Check, Layers, Plus, X } from 'lucide-react'
import { useRef } from 'react'
import { useI18n } from '../i18n'
import { Tooltip } from './Tooltip'

export interface QueueItem {
  id: string
  name: string
  thumbnail: string
  steps: number
}

interface Props {
  items: QueueItem[]
  activeId: string | null
  disabled: boolean
  max: number
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onFiles: (files: File[]) => void
  pendingBg: number
  onRemoveAllBg: () => void
  onZip: () => void
}

const TILT = ['-rotate-6', 'rotate-3', '-rotate-3', 'rotate-6']

// Floats over the preview instead of taking a row of its own: the image gets the
// whole canvas and the stack stays within reach at the top.
export function ImageQueue({ items, activeId, disabled, max, onSelect, onRemove, onFiles, pendingBg, onRemoveAllBg, onZip }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const atLimit = items.length >= max

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 p-3" aria-label={t.queue.label}>
      <div className="no-scrollbar pointer-events-auto flex min-w-0 items-center overflow-x-auto py-2 pl-2 pr-1" role="tablist" aria-label={t.queue.label}>
        {items.map((item, index) => {
          const active = item.id === activeId
          return (
            <div key={item.id} className={`group relative shrink-0 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${index ? '-ml-3' : ''} ${active ? 'z-10 scale-110' : `${TILT[index % TILT.length]} hover:z-10 hover:rotate-0 hover:scale-105`}`}>
              <Tooltip label={`${item.name} · ${t.queue.steps(item.steps)}`} placement="bottom">
                <button
                  type="button"
                  role="tab"
                  onClick={() => onSelect(item.id)}
                  disabled={disabled}
                  aria-selected={active}
                  aria-label={`${index + 1}. ${item.name}`}
                  className={`block size-14 overflow-hidden rounded-xl border-2 bg-panel/90 p-1 shadow-lg shadow-black/25 backdrop-blur transition disabled:opacity-50 ${active ? 'border-accent-solid' : 'border-line opacity-90'}`}
                >
                  <img src={item.thumbnail} alt="" className="checker size-full rounded-lg object-cover" />
                </button>
              </Tooltip>
              {active && (
                <span className="pointer-events-none absolute -bottom-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-accent-solid text-on-accent shadow">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                disabled={disabled}
                aria-label={t.queue.remove(item.name)}
                className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-line bg-panel text-dim opacity-0 shadow transition hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0"
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled || atLimit}
          className={`grid size-14 shrink-0 place-items-center rounded-xl border-2 border-dashed border-line/80 bg-panel/40 text-dim backdrop-blur transition hover:border-accent hover:text-accent disabled:opacity-40 ${items.length ? '-ml-2' : ''}`}
          aria-label={atLimit ? t.queue.limit(max) : t.queue.addHint}
          title={atLimit ? t.queue.limit(max) : t.queue.addHint}
        >
          <Plus className="size-6" />
        </button>
      </div>
      <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1 pt-2">
        {items.length > 1 && (
          <>
            <Tooltip label={t.batch.removeAllHint(pendingBg)} placement="bottom">
              <button type="button" onClick={onRemoveAllBg} disabled={disabled || pendingBg === 0} aria-label={t.batch.removeAllHint(pendingBg)}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-panel/80 px-2.5 py-1.5 text-xs font-semibold text-accent backdrop-blur hover:bg-line disabled:opacity-40">
                <Layers className="size-4" /><span className="hidden sm:inline">{t.batch.removeAll}</span>
              </button>
            </Tooltip>
            <Tooltip label={t.batch.zipHint(items.length)} placement="bottom">
              <button type="button" onClick={onZip} disabled={disabled} aria-label={t.batch.zipHint(items.length)}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-panel/80 px-2.5 py-1.5 text-xs font-semibold backdrop-blur hover:bg-line disabled:opacity-40">
                <Archive className="size-4" /><span className="hidden sm:inline">{t.batch.zip}</span>
              </button>
            </Tooltip>
          </>
        )}
        <span className="rounded-md bg-panel/70 px-1.5 py-1 font-mono text-[10px] text-dim backdrop-blur">{items.length}/{max}</span>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = '' }} />
    </div>
  )
}
