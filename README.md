# Alphaveil

Remove backgrounds, crop and upscale images with open-source AI models running **entirely in the browser** (WebGPU, WASM fallback). Nothing is uploaded anywhere.

Live: https://ketbome.github.io/alphaveil/

## Features

- **Background removal** — MODNet, RMBG 1.4, BiRefNet Lite or BiRefNet (selectable). Soft alpha masks processed locally.
- **Crop** — free or fixed aspect ratios, zoom, before or after removing the background.
- **Auto-trim** — crops transparent borders after background removal.
- **AI upscale** — Swin2SR ×2 (lightweight) or ×4 (real-world, JPEG-artifact aware), tiled to keep GPU memory bounded. Alpha is preserved.
- **Export** — PNG / WebP with transparency, or JPG with a solid background; preview on checkerboard or any color.
- **Frame subject** — after removing the background, crop around the detected subject in 1:1, 4:5, 3:4, 9:16, 16:9 or tight.
- **Retouch mask** — brush to erase leftover background or restore parts of the subject from the original photo, with softness, zoom and undo.
- **Backdrop** — bake a solid color or a blurred copy of the original photo behind the subject, with an optional soft shadow.
- **Batch** — remove the background of every open image in one go and download everything as a ZIP.
- **Size cap** — export JPG / WebP under 200 KB, 500 KB or 1 MB (quality is searched automatically).
- **Before / after curtain** — compare against the last framing step (source or crop), with a draggable divider.
- **Installable (PWA)** — service worker precaches the app shell; models stay in the browser cache, so it works offline after the first run.
- **Image queue** — up to 8 images open at once, one active at a time, each with its own undo history (last 6 steps kept).
- **Light / dark theme** (follows the system by default) and **4 languages**: English (base), Spanish, Portuguese, French, auto-detected from the browser.
- Undo history, drag & drop, clipboard paste.

## Models

| Task | Model | Size (WebGPU) | License |
| --- | --- | --- | --- |
| Background (default) | [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) | 88 MB (fp16) | BRIA non-commercial |
| Background | [onnx-community/BiRefNet_lite-ONNX](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) | 115 MB (fp16) | MIT |
| Background | [onnx-community/BiRefNet-ONNX](https://huggingface.co/onnx-community/BiRefNet-ONNX) | 490 MB (fp16) | MIT |
| Background (fallback) | [Xenova/modnet](https://huggingface.co/Xenova/modnet) | 13 MB (fp16) | Apache 2.0 |
| Upscale ×2 | [Xenova/swin2SR-lightweight-x2-64](https://huggingface.co/Xenova/swin2SR-lightweight-x2-64) | 8 MB | Apache 2.0 |
| Upscale ×4 | [onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr](https://huggingface.co/onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr-ONNX) | 54 MB | Apache 2.0 |

RMBG 1.4 is included because this project is non-commercial and its repository is available without authentication; the UI identifies its license restriction. RMBG 2.0 remains excluded because its gated download requires each user to accept access terms. BiRefNet uses the same underlying architecture, is MIT-licensed and is available without authentication. `VRMBG-3.0` is a gated video model, not the next still-image version.

Models are downloaded at pinned Hugging Face revisions and kept in the browser Cache API. The app requests the high-performance WebGPU adapter and displays the effective backend and precision. Browsers without WebGPU fall back to CPU inference through WASM for compatible lightweight models. BiRefNet requires 11 storage buffers per shader stage and is disabled when the adapter exposes fewer; running it in WASM/FP32 can exceed browser memory.

## Stack

Vite 8 · React 19 · TypeScript · Tailwind 4 · [@huggingface/transformers](https://github.com/huggingface/transformers.js) v4 · [@floating-ui/react](https://floating-ui.com) (tooltips / popovers) · [react-easy-crop](https://github.com/ValentinH/react-easy-crop) · [fflate](https://github.com/101arrowz/fflate) (ZIP) · [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)

Inference runs in a Web Worker (`src/lib/worker.ts`); the UI talks to it through `src/lib/engine.ts`. UI strings live in `src/i18n/` (English is the typed source of truth). SEO / Open Graph metadata is static per language: the build emits `/`, `/es/`, `/pt/` and `/fr/` with localized title, description, Open Graph tags and `hreflang` links, plus a sitemap listing all four.

## Development

```bash
npm install
npm run dev       # http://localhost:5173/alphaveil/
npm run build     # dist/
npm run lint
```

Deploys to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`).
