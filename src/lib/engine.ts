import type { Bitmap, Mask, Point, Request, Response, Status } from './worker'
import type { Device, Runtime } from './models'

export interface Progress {
  file: string
  progress: number
  loaded: number
  total: number
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

type Listeners = {
  progress?: (p: Progress) => void
  status?: (s: Status) => void
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void } & Listeners>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Response>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    if (msg.type === 'progress') p.progress?.(msg)
    else if (msg.type === 'status') p.status?.(msg.status)
    else if (msg.type === 'done') {
      pending.delete(msg.id)
      p.resolve(msg.result)
    } else {
      pending.delete(msg.id)
      p.reject(new Error(msg.message))
    }
  }
  return worker
}

function send<T>(req: DistributiveOmit<Request, 'id'>, listeners: Listeners = {}, transfer: Transferable[] = []) {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, ...listeners })
    getWorker().postMessage({ ...req, id }, transfer)
  })
}

export const engine = {
  detectDevice: () => send<Runtime>({ type: 'detect' }),
  load: (task: 'bg' | 'sr', model: string, revision: string, device: Device, dtype: string, onProgress: (p: Progress) => void) =>
    send<null>({ type: 'load', task, model, revision, device, dtype }, { progress: onProgress }),
  removeBg: (image: Bitmap, onStatus: (s: Status) => void) =>
    send<Bitmap>({ type: 'removeBg', image }, { status: onStatus }),
  upscale: (image: Bitmap, scale: number, onStatus: (s: Status) => void) =>
    send<Bitmap>({ type: 'upscale', image, scale }, { status: onStatus }),
  samEmbed: (image: Bitmap, device: Device, onProgress: (p: Progress) => void, onStatus: (s: Status) => void) =>
    send<null>({ type: 'samEmbed', image, device }, { progress: onProgress, status: onStatus }),
  samMask: (points: Point[]) => send<Mask>({ type: 'samMask', points }),
  matte: (image: Bitmap, device: Device, onProgress: (p: Progress) => void, onStatus: (s: Status) => void) =>
    send<Mask>({ type: 'matte', image, device }, { progress: onProgress, status: onStatus }),
  reset() {
    worker?.terminate()
    worker = null
    pending.forEach((p) => p.reject(new Error('cancelled')))
    pending.clear()
  },
}
