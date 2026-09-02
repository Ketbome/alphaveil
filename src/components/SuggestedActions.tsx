import type { ReactNode } from 'react'
import { useI18n } from '../i18n'

export interface SuggestedAction {
  id: string
  label: string
  detail: string
  icon: ReactNode
  onClick: () => void
  primary?: boolean
}

export function SuggestedActions({ actions, disabled }: { actions: SuggestedAction[]; disabled: boolean }) {
  const { t } = useI18n()
  if (actions.length === 0) return null

  return (
    <section className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-panel/55 px-3 py-2" aria-label={t.suggested}>
      <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{t.suggested}</span>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          disabled={disabled}
          className={`group flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition active:translate-y-px disabled:opacity-40 ${action.primary ? 'border-accent/35 bg-accent/10 text-accent hover:bg-accent/15' : 'border-line bg-ink/35 hover:border-dim'}`}
        >
          {action.icon}
          <span>
            <span className="block text-xs font-semibold leading-none">{action.label}</span>
            <span className={`mt-1 block text-[10px] leading-none ${action.primary ? 'text-accent/65' : 'text-dim'}`}>{action.detail}</span>
          </span>
        </button>
      ))}
    </section>
  )
}
