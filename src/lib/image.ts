import type { Bitmap } from './worker'

export const MAX_SIDE = 2048

export async function fileToBitmap(file: File): Promise<Bitmap> {
  const img = await createImageBitmap(file)
  const ratio = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
  const w = Math.round(img.width * ratio)
  const h = Math.round(img.height * ratio)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  img.close()
  const { data } = ctx.getImageData(0, 0, w, h)
  return { data, width: w, height: h }
}

export function toCanvas(bmp: Bitmap) {
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  canvas.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(new Uint8ClampedArray(bmp.data), bmp.width, bmp.height), 0, 0)
  return canvas
}

export function toDataUrl(bmp: Bitmap) {
  return toCanvas(bmp).toDataURL('image/png')
}

export function toThumbnailDataUrl(bmp: Bitmap, maxSide = 96) {
  const ratio = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const width = Math.max(1, Math.round(bmp.width * ratio))
  const height = Math.max(1, Math.round(bmp.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(toCanvas(bmp), 0, 0, width, height)
  return canvas.toDataURL('image/webp', 0.8)
}

export function cropBitmap(bmp: Bitmap, x: number, y: number, w: number, h: number): Bitmap {
  const ctx = toCanvas(bmp).getContext('2d')!
  const { data } = ctx.getImageData(x, y, w, h)
  return { data, width: w, height: h }
}

export function resizeBitmap(bmp: Bitmap, w: number, h: number): Bitmap {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(toCanvas(bmp), 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  return { data, width: w, height: h }
}

export function inspectAlpha({ data, width, height }: Bitmap, threshold = 8) {
  let transparent = false
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha < 255) transparent = true
      if (alpha > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const empty = maxX < 0
  return {
    transparent,
    trimmable: !empty && (minX > 0 || minY > 0 || maxX < width - 1 || maxY < height - 1),
    bounds: empty ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  }
}

export function trimTransparent(bmp: Bitmap, threshold = 8): Bitmap {
  const { bounds } = inspectAlpha(bmp, threshold)
  if (!bounds) return bmp
  return cropBitmap(bmp, bounds.x, bounds.y, bounds.width, bounds.height)
}

export function hasAlpha(bmp: Bitmap) {
  for (let i = 3; i < bmp.data.length; i += 4) if (bmp.data[i] < 255) return true
  return false
}

export interface Rect { x: number; y: number; width: number; height: number }

// Frame the opaque subject with a margin, optionally forcing an aspect ratio,
// clamped to the image. Returns null when the image has no opaque pixels.
export function smartCrop(bmp: Bitmap, aspect: number | null, margin = 0.08): Rect | null {
  const { bounds } = inspectAlpha(bmp)
  if (!bounds) return null
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  let w = bounds.width * (1 + 2 * margin)
  let h = bounds.height * (1 + 2 * margin)
  if (aspect) {
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    if (w > bmp.width) { w = bmp.width; h = w / aspect }
    if (h > bmp.height) { h = bmp.height; w = h * aspect }
  } else {
    w = Math.min(w, bmp.width)
    h = Math.min(h, bmp.height)
  }
  w = Math.round(w)
  h = Math.round(h)
  const x = Math.round(Math.min(Math.max(cx - w / 2, 0), bmp.width - w))
  const y = Math.round(Math.min(Math.max(cy - h / 2, 0), bmp.height - h))
  return { x, y, width: w, height: h }
}

export interface Backdrop {
  mode: 'color' | 'blur'
  color: string
  blur: number
  source: Bitmap | null
  shadow: boolean
}

// Bake a background (solid color or the blurred source photo) and an optional
// soft shadow under the subject into a new opaque bitmap.
export function composeBackdrop(bmp: Bitmap, opts: Backdrop): Bitmap {
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  if (opts.mode === 'blur' && opts.source) {
    const r = Math.max(2, Math.round(opts.blur * bmp.width / 1000))
    const src = opts.source
    const scale = Math.max((bmp.width + 6 * r) / src.width, (bmp.height + 6 * r) / src.height)
    const w = src.width * scale
    const h = src.height * scale
    ctx.fillStyle = opts.color
    ctx.fillRect(0, 0, bmp.width, bmp.height)
    ctx.filter = `blur(${r}px)`
    ctx.drawImage(toCanvas(src), (bmp.width - w) / 2, (bmp.height - h) / 2, w, h)
    ctx.filter = 'none'
  } else {
    ctx.fillStyle = opts.color
    ctx.fillRect(0, 0, bmp.width, bmp.height)
  }
  const subject = toCanvas(bmp)
  if (opts.shadow) {
    const s = Math.max(4, Math.round(bmp.width / 60))
    const silhouette = document.createElement('canvas')
    silhouette.width = bmp.width
    silhouette.height = bmp.height
    const sc = silhouette.getContext('2d')!
    sc.drawImage(subject, 0, 0)
    sc.globalCompositeOperation = 'source-in'
    sc.fillStyle = '#000'
    sc.fillRect(0, 0, bmp.width, bmp.height)
    ctx.save()
    ctx.filter = `blur(${s}px)`
    ctx.globalAlpha = 0.3
    ctx.drawImage(silhouette, s * 0.6, s * 1.2)
    ctx.restore()
  }
  ctx.drawImage(subject, 0, 0)
  const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height)
  return { data, width: bmp.width, height: bmp.height }
}

export async function exportBlob(bmp: Bitmap, opts: { format: 'png' | 'jpeg' | 'webp'; background: string | null; quality: number; maxBytes?: number | null }) {
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, bmp.width, bmp.height)
  }
  ctx.drawImage(toCanvas(bmp), 0, 0)
  const encode = (q: number) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export'))), `image/${opts.format}`, q))
  let blob = await encode(opts.quality)
  if (opts.maxBytes && opts.format !== 'png' && blob.size > opts.maxBytes) {
    let lo = 0.3, hi = opts.quality
    for (let i = 0; i < 6 && blob.size > opts.maxBytes && hi - lo > 0.02; i++) {
      const mid = (lo + hi) / 2
      const candidate = await encode(mid)
      if (candidate.size > opts.maxBytes) hi = mid
      else { lo = mid }
      blob = candidate.size <= opts.maxBytes ? candidate : blob
    }
    if (blob.size > opts.maxBytes) blob = await encode(lo)
  }
  return blob
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
