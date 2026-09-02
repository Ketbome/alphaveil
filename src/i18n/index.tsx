import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, type Dict } from './en'
import { es } from './es'
import { pt } from './pt'
import { fr } from './fr'

export type Lang = 'en' | 'es' | 'pt' | 'fr'

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
]

const dicts: Record<Lang, Dict> = { en, es, pt, fr }

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang')
    if (saved && saved in dicts) return saved as Lang
  } catch { /* private mode */ }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.slice(0, 2).toLowerCase()
    if (code in dicts) return code as Lang
  }
  return 'en'
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: Dict }>({ lang: 'en', setLang: () => {}, t: en })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detect)
  const t = dicts[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.seo.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.seo.description)
    try { localStorage.setItem('lang', lang) } catch { /* private mode */ }
  }, [lang, t])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)
