import { describe, expect, it } from 'vitest'
import { compareBase, type Step } from '../lib/history'
import type { Bitmap } from '../lib/worker'

const bmp = (w: number): Bitmap => ({ data: new Uint8ClampedArray(w * 4), width: w, height: 1 })
const step = (kind: Step['kind'], w: number): Step => ({ kind, bitmap: bmp(w) })

describe('compareBase', () => {
  it('needs at least two steps', () => {
    expect(compareBase([step('source', 10)])).toBeNull()
  })

  it('compares a background removal against the source', () => {
    const h = [step('source', 10), step('bg', 10)]
    expect(compareBase(h)).toBe(h[0].bitmap)
  })

  it('uses the crop as the base once the image was cropped', () => {
    const h = [step('source', 10), step('crop', 6), step('bg', 6)]
    expect(compareBase(h)).toBe(h[1].bitmap)
  })

  it('uses the latest framing step, skipping older AI steps', () => {
    const h = [step('source', 10), step('bg', 10), step('trim', 7), step('upscale', 14)]
    expect(compareBase(h)).toBe(h[2].bitmap)
  })

  it('has nothing to compare right after a crop or trim', () => {
    expect(compareBase([step('source', 10), step('crop', 6)])).toBeNull()
    expect(compareBase([step('source', 10), step('bg', 10), step('trim', 6)])).toBeNull()
  })
})
