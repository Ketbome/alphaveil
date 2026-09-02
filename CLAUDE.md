# Alphaveil

Client-side image tool: background removal, crop, AI upscale. Everything runs in the browser.

## Stack

Vite 8, React 19, TypeScript, Tailwind 4 (`@tailwindcss/vite`, theme tokens in `src/index.css`), `@huggingface/transformers` v4 (WebGPU / WASM), `@floating-ui/react`, `react-easy-crop`, `lucide-react`, `fflate` (ZIP export), `vite-plugin-pwa`.

## Commands

- `npm run dev` — dev server at `/alphaveil/`
- `npm run build` — `tsc -b && vite build && node scripts/localize-pages.ts` (emits `dist/{es,pt,fr}/index.html` + sitemap with hreflang)
- `npm run lint` — oxlint

## Structure

- `src/lib/worker.ts` — Web Worker: loads models, runs background removal (AutoModel + AutoProcessor, not the pipeline registry) and tiled Swin2SR upscaling.
- `src/lib/engine.ts` — promise-based client for the worker (progress/status callbacks).
- `src/lib/models.ts` — model catalog (ids, dtypes per device, sizes, licenses).
- `src/lib/image.ts` — canvas helpers: file → bitmap, crop, trim, `smartCrop` (frame the subject), `composeBackdrop` (color / blurred photo + shadow), `exportBlob` with optional byte cap.
- `src/lib/install.ts` — `beforeinstallprompt` hook for the PWA install button; `vite-plugin-pwa` (config in `vite.config.ts`) emits the manifest and a precaching service worker. Icons: `public/icon-192.png`, `public/icon-512.png`.
- `src/i18n/` — `en.ts` is the typed base dictionary (`Dict`); `es`, `pt`, `fr` must match it. `index.tsx` has the provider, `useI18n()`, URL-prefix detection (`/es/` wins over saved/browser language) and rewrites the URL on switch without reloading.
- `scripts/localize-pages.ts` — post-build: localized static copies of `index.html` per language and `sitemap.xml` (do not add a static sitemap to `public/`).
- `src/lib/theme.ts` — light / dark / system, stored in `localStorage`, applied as `data-theme` on `<html>`.
- `src/components/` — `Tooltip` / `Popover` (Floating UI), `Dropzone`, `ImageQueue`, `CropDialog`, `ModelPicker`, `RuntimeStatus`, `SuggestedActions`, `CompareView`, `Showcase`.
- `public/showcase/*.webp` — real cutouts produced by the app (trimmed, ≤900 px, alpha). `Showcase` floats them around the upload card on desktop and as a strip on mobile; prompts to regenerate sources live in `docs/asset-prompts.md`.
- `src/lib/history.ts` — `Step { bitmap, kind }` and `compareBase()`: the before/after curtain compares against the latest framing step (source, crop or trim), never across a crop.
- `src/App.tsx` — image queue (max 8, one active, 6-step history each), toolbar, export, batch (`removeBgAll`, `downloadAll`).
- Background model order in `models.ts` is the default order: RMBG 1.4 first (best general cutouts), MODNet last as the light fallback. Keep it that way unless the user asks.

## Conventions

- All UI copy goes through `useI18n()`; never hardcode strings in components. Add the key to `en.ts` first, then the other three. Code, commits and docs in English. Conventional commits.
- Colors only via theme tokens (`ink`, `panel`, `line`, `fg`, `muted`, `dim`, `accent`, `accent-solid`, `on-accent`, `warn`, `danger`) so both themes stay consistent. No raw `slate-*` / `lime-*` classes.
- The preview renders the bitmap straight into a `<canvas>`; data URLs are only built for thumbnails and for the crop dialog.
- Bitmaps cross the worker boundary as `{ data, width, height }` with transferred buffers.
- `base` is `/alphaveil/` (GitHub Pages). Deploy workflow in `.github/workflows/deploy.yml`.
- RMBG-2.0 is gated on the Hub and cannot be loaded from a static site; do not add it without a token-based loader.
