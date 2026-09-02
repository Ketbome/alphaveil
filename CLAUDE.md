# Alphaveil

Client-side image tool: background removal, crop, AI upscale. Everything runs in the browser.

## Stack

Vite 8, React 19, TypeScript, Tailwind 4 (`@tailwindcss/vite`, theme tokens in `src/index.css`), `@huggingface/transformers` v4 (WebGPU / WASM), `@floating-ui/react`, `react-easy-crop`, `lucide-react`, `fflate` (ZIP export), `vite-plugin-pwa`.

## Commands

- `npm run dev` — dev server at `/alphaveil/`
- `npm run build` — `tsc -b && vite build && node scripts/localize-pages.ts` (emits `dist/{es,pt,fr}/index.html` + sitemap with hreflang)
- `npm run lint` — oxlint

## Structure

- `src/lib/worker.ts` — Web Worker: loads models, runs background removal (AutoModel + AutoProcessor, not the pipeline registry), tiled Swin2SR upscaling, EdgeTAM / SAM 2 (`samEmbed` once per image, `samMask` per click set and optional box; returns the three candidate masks with the best index) and ViTMatte refinement (`matte`: trimap from the current alpha, run at ≤1024 px, alpha resized back). Sessions are disposed, not just dropped: `release`/`dropCached` free their GPU buffers, `loadPipe` keeps only the bg and sr sessions in use, a run that dies on the WebGPU storage-buffer limit evicts its own session (`evict`) so the client can reload it on WASM, and one that loses the GPU device evicts every session (`evictAll`) since they all die with it.
- `src/lib/engine.ts` — promise-based client for the worker (progress/status callbacks).
- `src/lib/models.ts` — model catalog (ids, dtypes per device, sizes, licenses) plus device selection: `modelDevice` also honours `runtime.blocked`, the ids that hit the GPU storage-buffer limit on this machine (kept in `localStorage.gpuBlocked`, refilled by `onGpuLimit` in `App.tsx`, which retries the operation once on WASM). `isGpuLimit` matches that onnxruntime-web error and must stay narrow, since a false positive moves the model to the CPU on every later visit; `isGpuLost` matches the separate "device lost / external Instance / compute pipeline" family, which is retried instead of blocked. `ModelPicker` offers to clear a blocked id.
- `src/lib/image.ts` — canvas helpers: file → bitmap, crop, trim, `smartCrop` (frame the subject), `composeBackdrop` (color / blurred photo + shadow), `exportBlob` with optional byte cap.
- `src/lib/install.ts` — `beforeinstallprompt` hook for the PWA install button; `vite-plugin-pwa` (config in `vite.config.ts`) emits the manifest and a precaching service worker. Icons: `public/icon-192.png`, `public/icon-512.png`.
- `src/i18n/` — `en.ts` is the typed base dictionary (`Dict`); `es`, `pt`, `fr` must match it. `index.tsx` has the provider, `useI18n()`, URL-prefix detection (`/es/` wins over saved/browser language) and rewrites the URL on switch without reloading.
- `scripts/localize-pages.ts` — post-build: localized static copies of `index.html` per language and `sitemap.xml` (do not add a static sitemap to `public/`).
- `src/lib/theme.ts` — light / dark / system, stored in `localStorage`, applied as `data-theme` on `<html>`.
- `src/components/` — `Tooltip` / `Popover` (Floating UI), `Dropzone`, `ImageQueue`, `CropDialog`, `ModelPicker`, `RuntimeStatus`, `SuggestedActions`, `CompareView`, `Showcase`, `MaskEditor` (erase with optional color-tolerance / restore / AI-in-area brush over the alpha; a SAM prompt that fails drops the embedding so re-entering the tool reloads the model; restore copies pixels from the last opaque step, so it needs matching dimensions; AI-in-area crops the painted bbox, runs `engine.removeBg` via `onDetect` and blends the new alpha weighted by the brush mask).
- `public/showcase/*.webp` — real cutouts produced by the app (trimmed, ≤900 px, alpha). `Showcase` floats them around the upload card on desktop and as a strip on mobile; prompts to regenerate sources live in `docs/asset-prompts.md`.
- `src/lib/history.ts` — `Step { bitmap, kind, origin }`: `origin` is the original photo carried through the same crops, trims and upscales, so `compareBase()` always compares against the original, aligned. While only the framing changed, `origin` is the same object as `bitmap` and there is nothing to compare. `reframe()` in `App.tsx` is the only way to crop or trim.
- `src/App.tsx` — image queue (max 8, one active, 6-step history each), toolbar, export, batch (`removeBgAll`, `downloadAll`). `ImageQueue` floats over the preview canvas (thumbnails plus a ghost tile with `+`), it is not a row of its own.
- `QualityChip` maps `ModelSpec.tier` (fast/balanced/best/max) to plain-language names; keep every user-selectable background model tagged with a tier. BiRefNet (full) has no tier: it only shows under "technical details". `SAM_MODEL` (EdgeTAM) / `MATTE_MODEL` are fixed helpers, not user-selectable.
- With no saved preference the app starts on the finest tier the machine can run (`bestAvailable`), and the before/after comparison is on by default.
- Background model order in `models.ts` is the default order: RMBG 1.4 first (best general cutouts), MODNet last as the light fallback. Keep it that way unless the user asks.

## Conventions

- All UI copy goes through `useI18n()`; never hardcode strings in components. Add the key to `en.ts` first, then the other three. Code, commits and docs in English. Conventional commits.
- Colors only via theme tokens (`ink`, `panel`, `line`, `fg`, `muted`, `dim`, `accent`, `accent-solid`, `on-accent`, `warn`, `danger`) so both themes stay consistent. No raw `slate-*` / `lime-*` classes.
- The preview renders the bitmap straight into a `<canvas>`; data URLs are only built for thumbnails and for the crop dialog.
- Bitmaps cross the worker boundary as `{ data, width, height }` with transferred buffers.
- `base` is `/alphaveil/` (GitHub Pages). Deploy workflow in `.github/workflows/deploy.yml`.
- RMBG-2.0 is gated on the Hub and cannot be loaded from a static site; do not add it without a token-based loader.
