import type { Bitmap } from './worker'

export type StepKind = 'source' | 'crop' | 'trim' | 'bg' | 'upscale' | 'compose' | 'retouch'

export interface Step {
  bitmap: Bitmap
  kind: StepKind
  // The original photo carried through the same crops, trims and upscales as
  // `bitmap`, so the comparison always lines up with what the user started from.
  origin: Bitmap
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
