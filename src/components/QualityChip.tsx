import { useState } from 'react'
import { Check, ChevronDown, Gauge } from 'lucide-react'
import { BG_MODELS, modelAvailable, modelSize, type ModelSpec, type Runtime } from '../lib/models'
import { useI18n } from '../i18n'
import { Popover } from './Popover'
import { ModelPicker } from './ModelPicker'

interface Props {
  value: ModelSpec
  runtime: Runtime
  onChange: (id: string) => void
  compact?: boolean
}

export function QualityChip({ value, runtime, onChange, compact }: Props) {
  const { t } = useI18n()
  const [details, setDetails] = useState(false)
  const tier = value.tier ? t.quality.tiers[value.tier] : null

  return (
    <Popover placement="bottom-start" className="max-h-[calc(100dvh-4rem)] overflow-y-auto" trigger={({ open }) => (
      <button type="button" aria-label={t.quality.label} className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm transition hover:border-dim ${open ? 'bg-line' : ''}`}>
        <Gauge className="size-4 text-accent" />
        {!compact && <span className="text-muted">{t.quality.short}:</span>}
        <span className="font-semibold">{tier?.name ?? value.name}</span>
        <ChevronDown className="size-3.5 text-dim" />
      </button>
    )}>
      {(close) => (
        <div className="w-[min(20rem,calc(100vw-3rem))] space-y-3">
          <div className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{t.quality.label}</div>
          <ul className="space-y-1" role="radiogroup" aria-label={t.quality.label}>
            {BG_MODELS.filter((m) => m.tier).map((m) => {
              const active = m.id === value.id
              const ok = modelAvailable(m, runtime)
              const tt = t.quality.tiers[m.tier!]
              return (
                <li key={m.id}>
                  <button type="button" role="radio" aria-checked={active} disabled={!ok} onClick={() => { onChange(m.id); close() }}
                    className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-45 ${active ? 'border-accent/40 bg-accent/5' : 'border-transparent hover:border-line hover:bg-line/55'}`}>
                    <Check className={`mt-0.5 size-4 shrink-0 ${active ? 'text-accent' : 'invisible'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold">{tt.name}<span className="font-mono text-[10px] font-normal text-dim">{modelSize(m, runtime)}</span></span>
                      <span className="block text-xs text-muted">{tt.when}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => setDetails((v) => !v)} className="px-1 text-xs text-dim underline-offset-2 hover:text-accent hover:underline">{t.quality.details}</button>
          {details && <ModelPicker title={t.models.bg} models={BG_MODELS} value={value.id} runtime={runtime} onChange={(id) => { onChange(id); close() }} />}
        </div>
      )}
    </Popover>
  )
}
