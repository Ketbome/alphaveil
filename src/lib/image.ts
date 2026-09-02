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
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bmp.data), bmp.width, bmp.height), 0, 0)
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

export async function exportBlob(bmp: Bitmap, opts: { format: 'png' | 'jpeg' | 'webp'; background: string | null; quality: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, bmp.width, bmp.height)
  }
  ctx.drawImage(toCanvas(bmp), 0, 0)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export'))), `image/${opts.format}`, opts.quality),
  )
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
