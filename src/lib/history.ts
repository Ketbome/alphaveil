import type { Bitmap } from './worker'

export type StepKind = 'source' | 'crop' | 'trim' | 'bg' | 'upscale'

export interface Step {
  bitmap: Bitmap
  kind: StepKind
}

// Crops and trims change the framing, so a comparison against anything earlier
// would misalign. The "before" is the latest framing step that precedes the
// current result; if the current step is itself a framing step there is nothing
// meaningful to compare.
export function compareBase(history: Step[]): Bitmap | null {
  if (history.length < 2) return null
  const last = history[history.length - 1]
  if (last.kind === 'crop' || last.kind === 'trim' || last.kind === 'source') return null
  for (let i = history.length - 2; i >= 0; i--) {
    const k = history[i].kind
    if (k === 'source' || k === 'crop' || k === 'trim') return history[i].bitmap
  }
  return history[0].bitmap
}
