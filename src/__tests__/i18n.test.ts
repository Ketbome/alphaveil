import { describe, expect, it } from 'vitest'
import { en } from '../i18n/en'
import { es } from '../i18n/es'
import { pt } from '../i18n/pt'
import { fr } from '../i18n/fr'
import { BG_MODELS, SR_MODELS } from '../lib/models'

type Tree = Record<string, unknown>

function shape(obj: Tree, path = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = `${path}${k}`
    if (typeof v === 'function') return [`${key}:fn${v.length}`]
    if (v && typeof v === 'object') return shape(v as Tree, `${key}.`)
    return [`${key}:${typeof v}`]
  })
}

const dicts = { es, pt, fr }

describe('translations', () => {
  const base = shape(en)

  for (const [lang, dict] of Object.entries(dicts)) {
    it(`${lang} has exactly the same keys and function arities as en`, () => {
      expect(shape(dict)).toEqual(base)
    })

    it(`${lang} has no empty strings`, () => {
      const empty = shape(dict).length && JSON.stringify(dict, (_, v) => (typeof v === 'function' ? 'fn' : v)).includes('""')
      expect(empty).toBe(false)
    })
  }

  it('describes every catalog model in every language', () => {
    for (const dict of [en, es, pt, fr]) {
      for (const m of [...BG_MODELS, ...SR_MODELS]) {
        expect(dict.models.entries[m.id]?.profile).toBeTruthy()
        expect(dict.models.entries[m.id]?.hint).toBeTruthy()
        expect(dict.models.licenses[m.license]).toBeTruthy()
      }
    }
  })

  it('formats parametrized strings', () => {
    expect(en.tool.upscale(4)).toBe('Upscale ×4')
    expect(es.queue.steps(1)).toBe('1 PASO')
    expect(es.queue.steps(3)).toBe('3 PASOS')
    expect(fr.busy.upscaling(2, 9)).toContain('2/9')
  })
})
