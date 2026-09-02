import { Check } from 'lucide-react'
import { modelAvailable, modelDevice, modelDtype, modelSize, type ModelSpec, type Runtime } from '../lib/models'
import { useI18n } from '../i18n'

interface Props {
  title: string
  models: ModelSpec[]
  value: string
  runtime: Runtime
  onChange: (id: string) => void
  onUnblock: (id: string) => void
}

export function ModelPicker({ title, models, value, runtime, onChange, onUnblock }: Props) {
  const { t } = useI18n()
  return (
    <div className="w-full min-w-0" role="radiogroup" aria-label={title}>
      <div className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{title}</div>
      <ul className="space-y-1">
        {models.map((m) => {
          const active = m.id === value
          const dtype = modelDtype(m, runtime)
          const device = modelDevice(m, runtime)
          const fallback = runtime.device === 'webgpu' && device === 'wasm'
          const blocked = runtime.blocked?.includes(m.id) ?? false
          const available = modelAvailable(m, runtime)
          const copy = t.models.entries[m.id]
          return (
            <li key={m.id}>
              <button
                type="button"
                role="radio"
                onClick={() => onChange(m.id)}
                disabled={!available}
                aria-checked={active}
                className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-accent/25 bg-accent/5' : 'border-transparent hover:border-line hover:bg-line/55'}`}
              >
                <Check className={`mt-0.5 size-4 shrink-0 ${active ? 'text-accent' : 'invisible'}`} />
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                    <span>{m.name}</span>
                    <span className="shrink-0 font-mono text-[10px] font-normal text-muted">{modelSize(m, runtime)} · {dtype}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-accent/80">{copy?.profile}</div>
                  <div className="text-xs text-muted">{copy?.hint}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-dim">
                    <span>{t.models.licenses[m.license] ?? m.license}</span><span>·</span><span className={fallback ? 'text-warn' : ''}>{device.toUpperCase()}</span>
                  </div>
                  {fallback && !blocked ? <div className="mt-1.5 text-[10px] leading-snug text-warn/80">{t.models.fallback(runtime.maxStorageBuffersPerShaderStage, m.minStorageBuffers ?? 0)} {available ? t.models.useCpu : t.models.noCpu}</div> : null}
                  {copy?.warning ? <div className="mt-1.5 text-[10px] leading-snug text-warn/80">{copy.warning}</div> : null}
                </div>
              </button>
              {blocked ? (
                <div className="-mt-0.5 pb-1.5 pl-8 pr-2.5 text-[10px] leading-snug text-warn/80">
                  {t.models.blocked} {available ? t.models.useCpu : t.models.noCpu}{' '}
                  <button type="button" onClick={() => onUnblock(m.id)} className="font-semibold text-accent underline underline-offset-2">{t.models.unblock}</button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
