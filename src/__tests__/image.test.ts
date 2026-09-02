import { describe, expect, it } from 'vitest'
import { formatBytes, hasAlpha, inspectAlpha } from '../lib/image'
import type { Bitmap } from '../lib/worker'

function bitmap(width: number, height: number, alphaAt: (x: number, y: number) => number): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = 10; data[i + 1] = 20; data[i + 2] = 30; data[i + 3] = alphaAt(x, y)
    }
  }
  return { data, width, height }
}

describe('inspectAlpha', () => {
  it('reports an opaque image as neither transparent nor trimmable', () => {
    const r = inspectAlpha(bitmap(4, 4, () => 255))
    expect(r).toMatchObject({ transparent: false, trimmable: false })
    expect(r.bounds).toEqual({ x: 0, y: 0, width: 4, height: 4 })
  })

  it('finds the opaque bounding box inside a transparent border', () => {
    const r = inspectAlpha(bitmap(10, 8, (x, y) => (x >= 2 && x <= 6 && y >= 1 && y <= 5 ? 255 : 0)))
    expect(r.transparent).toBe(true)
    expect(r.trimmable).toBe(true)
    expect(r.bounds).toEqual({ x: 2, y: 1, width: 5, height: 5 })
  })

  it('ignores faint alpha noise below the threshold', () => {
    const r = inspectAlpha(bitmap(6, 6, (x, y) => (x === 3 && y === 3 ? 255 : 4)))
    expect(r.bounds).toEqual({ x: 3, y: 3, width: 1, height: 1 })
  })

  it('returns null bounds for a fully transparent image', () => {
    const r = inspectAlpha(bitmap(3, 3, () => 0))
    expect(r.bounds).toBeNull()
    expect(r.trimmable).toBe(false)
  })

  it('is not trimmable when content already touches every edge', () => {
    const r = inspectAlpha(bitmap(5, 5, (x, y) => (x === 0 || y === 0 || x === 4 || y === 4 ? 255 : 0)))
    expect(r.transparent).toBe(true)
    expect(r.trimmable).toBe(false)
  })
})

describe('hasAlpha', () => {
  it('detects any non-opaque pixel', () => {
    expect(hasAlpha(bitmap(2, 2, () => 255))).toBe(false)
    expect(hasAlpha(bitmap(2, 2, (x) => (x ? 254 : 255)))).toBe(true)
  })
})

describe('formatBytes', () => {
  it('uses KB below a megabyte and MB above', () => {
    expect(formatBytes(512)).toBe('1 KB')
    expect(formatBytes(1024 * 300)).toBe('300 KB')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })
})
