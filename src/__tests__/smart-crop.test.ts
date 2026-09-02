import { describe, expect, it } from 'vitest'
import { smartCrop } from '../lib/image'
import type { Bitmap } from '../lib/worker'

function subject(width: number, height: number, box: { x: number; y: number; w: number; h: number }): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) data[(y * width + x) * 4 + 3] = 255
  return { data, width, height }
}

describe('smartCrop', () => {
  it('returns null without an opaque subject', () => {
    expect(smartCrop({ data: new Uint8ClampedArray(16), width: 2, height: 2 }, 1)).toBeNull()
  })

  it('frames the subject with a margin when no aspect is forced', () => {
    const r = smartCrop(subject(200, 200, { x: 50, y: 50, w: 100, h: 100 }), null, 0.1)!
    expect(r).toEqual({ x: 40, y: 40, width: 120, height: 120 })
  })

  it('forces a square centered on the subject', () => {
    const r = smartCrop(subject(400, 300, { x: 100, y: 100, w: 50, h: 100 }), 1, 0)!
    expect(r.width).toBe(r.height)
    expect(r.width).toBe(100)
    expect(r.x + r.width / 2).toBe(125)
    expect(r.y + r.height / 2).toBe(150)
  })

  it('clamps the frame inside the image', () => {
    const r = smartCrop(subject(300, 300, { x: 0, y: 0, w: 60, h: 60 }), 16 / 9, 0.2)!
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width).toBeLessThanOrEqual(300)
    expect(r.y + r.height).toBeLessThanOrEqual(300)
    expect(r.width / r.height).toBeCloseTo(16 / 9, 1)
  })

  it('never exceeds the image for a tall aspect on a wide image', () => {
    const r = smartCrop(subject(1000, 200, { x: 400, y: 20, w: 200, h: 160 }), 9 / 16, 0.1)!
    expect(r.height).toBe(200)
    expect(r.width).toBe(Math.round(200 * 9 / 16))
  })
})
