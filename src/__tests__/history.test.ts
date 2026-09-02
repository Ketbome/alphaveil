import { describe, expect, it } from 'vitest'
import { compareBase, type Step } from '../lib/history'
import type { Bitmap } from '../lib/worker'

const bmp = (w: number): Bitmap => ({ data: new Uint8ClampedArray(w * 4), width: w, height: 1 })
const source = (w: number): Step => {
  const b = bmp(w)
  return { kind: 'source', bitmap: b, origin: b }
}
const step = (kind: Step['kind'], w: number, origin: Bitmap): Step => ({ kind, bitmap: bmp(w), origin })

describe('compareBase', () => {
  it('needs something done to the photo', () => {
    expect(compareBase([source(10)])).toBeNull()
  })

  it('compares a background removal against the original', () => {
    const h = [source(10)]
    h.push(step('bg', 10, h[0].origin))
    expect(compareBase(h)).toBe(h[0].bitmap)
  })

  it('keeps comparing against the original after a crop, reframed the same way', () => {
    const h = [source(10)]
    h.push(step('bg', 10, h[0].origin))
    const cropped = bmp(6)
    h.push({ kind: 'crop', bitmap: bmp(6), origin: cropped })
    expect(compareBase(h)).toBe(cropped)
  })

  it('has nothing to compare while only the framing changed', () => {
    const h = [source(10)]
    const crop = bmp(6)
    h.push({ kind: 'crop', bitmap: crop, origin: crop })
    expect(compareBase(h)).toBeNull()
  })
})
