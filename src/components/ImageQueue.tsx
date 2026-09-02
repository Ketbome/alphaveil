import { Check, Plus, X } from 'lucide-react'
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
}

const TILT = ['-rotate-6', 'rotate-3', '-rotate-3', 'rotate-6']

export function ImageQueue({ items, activeId, disabled, max, onSelect, onRemove, onFiles }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const atLimit = items.length >= max

  return (
    <section className="flex shrink-0 items-center gap-4 border-b border-line bg-panel/40 px-4 py-3" aria-label={t.queue.label}>
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto px-2 py-2" role="tablist" aria-label={t.queue.label}>
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
                  className={`block size-16 overflow-hidden rounded-xl border-2 bg-panel p-1 shadow-lg shadow-black/15 transition disabled:opacity-50 ${active ? 'border-accent-solid' : 'border-line opacity-90'}`}
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
          className={`grid size-16 shrink-0 place-items-center rounded-xl border-2 border-dashed border-line text-dim transition hover:border-accent hover:text-accent disabled:opacity-40 ${items.length ? '-ml-2' : ''}`}
          aria-label={atLimit ? t.queue.limit(max) : t.queue.addHint}
          title={atLimit ? t.queue.limit(max) : t.queue.addHint}
        >
          <Plus className="size-6" />
        </button>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-dim">{items.length}/{max}</span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = '' }} />
    </section>
  )
}
