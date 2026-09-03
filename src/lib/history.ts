import type { Bitmap } from './worker'

export type StepKind = 'source' | 'crop' | 'trim' | 'bg' | 'upscale' | 'sharpen' | 'compose' | 'retouch'

export interface Step {
  bitmap: Bitmap
  kind: StepKind
  // The original photo carried through the same crops, trims and upscales as
  // `bitmap`, so the comparison always lines up with what the user started from.
  origin: Bitmap
}

export const MAX_STEPS = 6
// A step at 2048 px is ~17 MB, so ordinary work never reaches this and the step count
// is what binds. It exists for the big ones: a ×4 upscale is ~165 MB with its origin,
// and six of those per image across eight images is a dead tab. Per image, so the
// ceiling is this times the queue — reached only by upscaling every image to the max.
export const MAX_BYTES = 192 * 1024 * 1024

// Steps share their `origin` with the steps before them, so count each buffer once.
function bytes(history: Step[]) {
  const seen = new Set<Uint8ClampedArray>()
  let total = 0
  for (const step of history) {
    for (const b of [step.bitmap, step.origin]) {
      if (seen.has(b.data)) continue
      seen.add(b.data)
      total += b.data.length
    }
  }
  return total
}

// The newest steps that fit the budget. The current one always stays, however big.
export function trimHistory(history: Step[]): Step[] {
  const steps = history.slice(-MAX_STEPS)
  let from = 0
  while (from < steps.length - 1 && bytes(steps.slice(from)) > MAX_BYTES) from++
  return from ? steps.slice(from) : steps
}

// Always the original photo, framed like the current step. While nothing but
// framing has happened the two are the same bitmap and there is nothing to show.
export function compareBase(history: Step[]): Bitmap | null {
  const last = history.at(-1)
  if (!last || last.origin === last.bitmap) return null
  return last.origin
}

// The most recent step that still had the original photo behind the subject:
// used as the source for a blurred backdrop. Framing may differ; callers fit it.
export function lastOpaque(history: Step[], isOpaque: (b: Bitmap) => boolean): Bitmap | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].kind !== 'bg' && isOpaque(history[i].bitmap)) return history[i].bitmap
  }
  return null
}
