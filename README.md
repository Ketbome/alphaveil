# Alphaveil

Remove backgrounds, crop and upscale images with open-source AI models running **entirely in the browser** (WebGPU, WASM fallback). Nothing is uploaded anywhere.

Live: https://ketbome.github.io/alphaveil/

## Features

- **Background removal** — BEN2, BiRefNet Lite, RMBG 1.4 or MODNet (selectable). Soft alpha masks processed locally. With no saved preference the app opens on the finest quality the machine can actually run.
- **Crop** — free or fixed aspect ratios, zoom, before or after removing the background.
- **Auto-trim** — crops transparent borders after background removal.
- **AI upscale** — Swin2SR ×2 (lightweight) or ×4 (real-world, JPEG-artifact aware), tiled to keep GPU memory bounded. Alpha is preserved.
- **Export** — PNG / WebP with transparency, or JPG with a solid background; preview on checkerboard or any color.
- **Frame subject** — after removing the background, crop around the detected subject in 1:1, 4:5, 3:4, 9:16, 16:9 or tight.
- **Click the object** — EdgeTAM (Segment Anything 2) selection: click include / exclude points **or drag a box** around the subject, pick one of the three candidate shapes the model returns (object, part, whole), then keep only that or remove it. This is the tool for busy scenes where the automatic model keeps the couch or the blanket.
- **Refine edges** — ViTMatte recomputes hair and fur edges from a trimap built around the current mask.
- **Retouch mask** — brush to erase leftover background (optionally only colors similar to where the stroke started, so it stops at the subject), restore parts of the subject from the original photo, or **paint an area and run the model only there** (the crop is segmented at full model resolution and blended back with the brush's soft edge). Softness, zoom and undo.
- **Backdrop** — bake a solid color or a blurred copy of the original photo behind the subject, with an optional soft shadow.
- **Batch** — remove the background of every open image in one go and download everything as a ZIP.
- **Size cap** — export JPG / WebP under 200 KB, 500 KB or 1 MB (quality is searched automatically).
- **Before / after curtain** — always compares against the original photo, carried through the same crops, trims and upscales so it stays aligned. On by default, with a draggable divider.
- **Installable (PWA)** — service worker precaches the app shell; models stay in the browser cache, so it works offline after the first run.
- **Plain-language quality picker** — Fast / Balanced / High / Maximum next to the Remove background button (technical model details one click deeper), a first-run tip, and automatic suggestions when a cutout looks like it kept the background.
- **Image queue** — up to 8 images open at once, floating over the canvas (thumbnails plus a ghost tile with `+`), one active at a time, each with its own undo history (last 6 steps kept).
- **Light / dark theme** (follows the system by default) and **4 languages**: English (base), Spanish, Portuguese, French, auto-detected from the browser.
- **Automatic CPU fallback** — a model that exceeds this GPU's storage-buffer limit is remembered for the machine, reloaded on WASM and the operation is retried once, instead of failing with an `OrtRun` error.
- Undo history, drag & drop, clipboard paste.

## Models

| Task | Model | Tier | Size (WebGPU) | License |
| --- | --- | --- | --- | --- |
| Background | [onnx-community/BEN2-ONNX](https://huggingface.co/onnx-community/BEN2-ONNX) | Maximum | 219 MB (fp16) | MIT |
| Background | [onnx-community/BiRefNet_lite-ONNX](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) | High | 115 MB (fp16) | MIT |
| Background | [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) | Balanced | 88 MB (fp16) | BRIA non-commercial |
| Background | [Xenova/modnet](https://huggingface.co/Xenova/modnet) | Fast | 13 MB (fp16) | Apache 2.0 |
| Background | [onnx-community/BiRefNet-ONNX](https://huggingface.co/onnx-community/BiRefNet-ONNX) | — (technical details only) | 490 MB (fp16) | MIT |
| Click-to-select | [onnx-community/EdgeTAM-ONNX](https://huggingface.co/onnx-community/EdgeTAM-ONNX) | — | 31 MB (encoder fp16 + decoder fp32) | Apache 2.0 |
| Edge matting | [Xenova/vitmatte-small-composition-1k](https://huggingface.co/Xenova/vitmatte-small-composition-1k) | — | 104 MB (fp32) / 28 MB (q8) | Apache 2.0 |
| Upscale ×2 | [Xenova/swin2SR-lightweight-x2-64](https://huggingface.co/Xenova/swin2SR-lightweight-x2-64) | — | 8 MB | Apache 2.0 |
| Upscale ×4 | [onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr](https://huggingface.co/onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr-ONNX) | — | 54 MB | Apache 2.0 |

RMBG 1.4 is included because this project is non-commercial and its repository is available without authentication; the UI identifies its license restriction. RMBG 2.0 remains excluded because its gated download requires each user to accept access terms. BiRefNet uses the same underlying architecture, is MIT-licensed and is available without authentication. `VRMBG-3.0` is a gated video model, not the next still-image version.

EdgeTAM is a distilled SAM 2 and replaces SlimSAM: same download size, noticeably better masks, and it accepts box prompts.

Models are downloaded at pinned Hugging Face revisions and kept in the browser Cache API. The app requests the high-performance WebGPU adapter and displays the effective backend and precision. Browsers without WebGPU fall back to CPU inference through WASM for compatible lightweight models.

Two separate GPU limits are handled. Ahead of time: BiRefNet declares 11 storage buffers per shader stage and is disabled when the adapter exposes fewer (running it in WASM/FP32 can exceed browser memory). At runtime: some shaders only blow the limit while executing — an AMD RX 5700 XT reports 16 buffers and a shader asks for 17 — so the failing model id is stored in `localStorage.gpuBlocked`, its dead session is dropped, and the operation is retried once on WASM. If the model is too heavy for the CPU, the UI says so and points at the quality picker.

## Stack

Vite 8 · React 19 · TypeScript · Tailwind 4 · [@huggingface/transformers](https://github.com/huggingface/transformers.js) v4 · [@floating-ui/react](https://floating-ui.com) (tooltips / popovers) · [react-easy-crop](https://github.com/ValentinH/react-easy-crop) · [fflate](https://github.com/101arrowz/fflate) (ZIP) · [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)

Inference runs in a Web Worker (`src/lib/worker.ts`); the UI talks to it through `src/lib/engine.ts`. UI strings live in `src/i18n/` (English is the typed source of truth). SEO / Open Graph metadata is static per language: the build emits `/`, `/es/`, `/pt/` and `/fr/` with localized title, description, Open Graph tags, JSON-LD (`WebApplication`) and `hreflang` links, plus `robots.txt` and a sitemap listing all four. Icon and manifest URLs are absolute (`/alphaveil/…`) so the localized copies under `/es/`, `/pt/` and `/fr/` resolve them instead of looking for a favicon inside their own folder.

## Development

```bash
npm install
npm run dev       # http://localhost:5173/alphaveil/
npm run build     # dist/
npm run lint
```

Deploys to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`).
