import { describe, expect, it } from 'vitest'
import { langFromPath, pathForLang } from '../i18n'

describe('language in the URL', () => {
  it('reads the locale prefix under the base path', () => {
    expect(langFromPath('/alphaveil/es/', '/alphaveil/')).toBe('es')
    expect(langFromPath('/alphaveil/fr', '/alphaveil/')).toBe('fr')
    expect(langFromPath('/alphaveil/', '/alphaveil/')).toBeNull()
    expect(langFromPath('/alphaveil/nope/', '/alphaveil/')).toBeNull()
  })

  it('builds the path for a locale, keeping English at the root', () => {
    expect(pathForLang('en', '/alphaveil/')).toBe('/alphaveil/')
    expect(pathForLang('pt', '/alphaveil/')).toBe('/alphaveil/pt/')
  })
})
