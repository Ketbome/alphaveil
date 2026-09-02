import { Plus, X } from 'lucide-react'
import { useRef } from 'react'
import { useI18n } from '../i18n'

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

export function ImageQueue({ items, activeId, disabled, max, onSelect, onRemove, onFiles }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const atLimit = items.length >= max

  return (
    <section className="flex shrink-0 items-center gap-2 border-b border-line bg-panel/40 px-3 py-2" aria-label={t.queue.label}>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" role="tablist" aria-label={t.queue.label}>
        {items.map((item, index) => {
          const active = item.id === activeId
          return (
            <div key={item.id} className={`group relative flex shrink-0 items-center rounded-lg border pr-7 transition ${active ? 'border-accent/45 bg-accent/8' : 'border-line bg-ink/35 hover:border-dim'}`}>
              <button
                type="button"
                role="tab"
                onClick={() => onSelect(item.id)}
                disabled={disabled}
                aria-selected={active}
                className="flex min-w-0 items-center gap-2 rounded-l-lg p-1.5 pr-2 text-left disabled:opacity-50"
              >
                <img src={item.thumbnail} alt="" className="size-9 rounded-md bg-line object-cover" />
                <span className="w-24 min-w-0 sm:w-32">
                  <span className="block truncate text-xs font-semibold">{index + 1}. {item.name}</span>
                  <span className="mt-0.5 block font-mono text-[9px] text-dim">{t.queue.steps(item.steps)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                disabled={disabled}
                aria-label={t.queue.remove(item.name)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-dim hover:bg-line hover:text-fg disabled:opacity-40"
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || atLimit}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-semibold hover:border-dim hover:bg-line disabled:opacity-40"
        aria-label={atLimit ? t.queue.limit(max) : t.queue.addHint}
        title={atLimit ? t.queue.limit(max) : undefined}
      >
        <Plus className="size-4" /><span className="hidden sm:inline">{t.queue.add}</span>
        <span className="font-mono text-[10px] text-dim">{items.length}/{max}</span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = '' }} />
    </section>
  )
}
