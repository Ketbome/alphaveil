# Browser Image Processing Design

## Status

Approved on 2026-09-02.

## Goal

Alphaveil processes images entirely in the browser. Users can crop, remove a background, trim transparent borders, and upscale an image without uploading it. The application suggests useful next actions but never runs an AI operation without user confirmation.

## Constraints

- Use WebGPU when available and WASM as the CPU fallback.
- Request the high-performance WebGPU adapter, but do not claim to know GPU performance or VRAM when the browser does not expose it.
- Keep image data on the user's device.
- Prefer models under open-source licenses such as MIT or Apache 2.0.
- Include RMBG 1.4 as an explicitly labelled non-commercial option because the project is non-commercial and its repository is ungated.
- Do not include RMBG 2.0 or VRMBG 3.0 because their repositories are gated. VRMBG 3.0 is also a video model.
- Keep every editing operation independently selectable.

## Model Distribution

Models load directly from Hugging Face and remain in the Transformers.js browser cache after the first download. Each catalog entry pins a Hugging Face commit revision so deployments do not change when a model repository updates.

Model weights will not be committed to this repository or copied to GitHub Pages. This avoids large deployments, duplicate hosting, and unnecessary bandwidth usage.

## Model Catalog

### Background Removal

| Profile | Model | Revision | License | Purpose |
| --- | --- | --- | --- | --- |
| Fast compatible | `Xenova/modnet` | `fa2fa546` | Apache 2.0 | Default model, people, small download, broad WebGPU support |
| General non-commercial | `briaai/RMBG-1.4` | `2ceba5a5` | BRIA non-commercial | Products, people and general objects |
| Balanced | `onnx-community/BiRefNet_lite-ONNX` | `de15b22b` | MIT | General-purpose model when the GPU supports its shader requirements |
| Maximum quality | `onnx-community/BiRefNet-ONNX` | `534d3c82` | MIT | Fine edges and difficult subjects on capable hardware |

The complete BiRefNet model must show a memory and download warning. It is selectable rather than automatically chosen.

### Upscaling

| Profile | Model | Revision | License | Purpose |
| --- | --- | --- | --- | --- |
| Fast x2 | `Xenova/swin2SR-lightweight-x2-64` | `92a21aca` | Apache 2.0 | Double resolution with low model cost |
| Real-world x4 | `onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr-ONNX` | `9b3baf05` | Apache 2.0 | Enlarge and reduce common JPEG artifacts |

Upscaling remains tiled to bound peak GPU memory and preserves the existing alpha channel.

## Device Selection

The worker requests a WebGPU adapter with `powerPreference: "high-performance"` and reads its feature and limit values. When an adapter is available, inference uses WebGPU with `fp16` for catalog entries that provide it. BiRefNet shaders require at least 11 storage buffers per shader stage; those models are disabled when the adapter is below that limit because their WASM/FP32 inference can exceed browser memory. Other compatible models continue using WebGPU on the same device. If WebGPU itself is unavailable, the worker reports WASM and uses lightweight models with `q8` where available.

Detection returns structured capabilities rather than only `webgpu` or `wasm`. The UI displays the selected backend, precision, and model, for example:

- `WebGPU · fp16 · BiRefNet Lite`
- `WASM · q8 · MODNet`

The application may use adapter features and limits to warn about a heavy model. It must not present those limits as measured GPU speed or available VRAM.

## Suggested Actions

Suggestions are deterministic and do not require loading another AI model:

- An opaque imported image suggests background removal.
- An image whose longest side is below 1024 pixels suggests x2 upscaling.
- An image with pixels below the existing alpha threshold and a transparent outer border suggests trimming to content.
- Crop remains available without being automatically recommended unless the image has already entered the crop flow.

Suggestions use the same handlers as the toolbar. Clicking a suggested action is the user's confirmation and starts that operation; loading an image by itself never starts processing.

## Processing Flow

1. Decode the local file and retain the existing maximum input-side safeguard.
2. Detect WebGPU capabilities; fall back to WASM when unavailable.
3. Present applicable suggestions and independent editing controls.
4. On user action, load the selected pinned model and report download progress.
5. Run inference in the Web Worker and transfer the resulting bitmap back to the UI.
6. Add the result to history so undo behavior remains unchanged.
7. Export PNG, WebP, or JPEG locally.

## Errors

- A model download failure keeps the current image and reports a retryable error.
- A WebGPU initialization failure falls back to WASM before processing starts.
- A WebGPU inference or out-of-memory failure reports the failure and recommends a lighter model; it does not silently rerun a long CPU operation.
- Unsupported browsers continue to provide non-AI crop and export operations.

## UI Changes

- Replace the current backend badge with a status that states backend and precision.
- Show which backend and model will be used before processing.
- Show model purpose, license, download size, and a warning for heavy models.
- Add a compact suggested-actions area without changing the independent toolbar workflow.
- Preserve the existing Spanish UI copy and visual language.

### Visual Direction

The interface uses a dark editorial workbench rather than a marketing landing page. The canvas and current task remain dominant. Lime is the only accent, technical values use monospace text, and motion is limited to state feedback.

The empty state uses an asymmetric introduction and a large upload target. It explains the local processing flow without pushing the upload action below the initial viewport. Desktop may place generated before-and-after specimens around the upload area; mobile reflows those specimens into a horizontal strip.

Generated specimens are optional assets, not fake UI. Until the final files exist, the application renders a complete empty state without broken images or visible placeholders. Asset names, dimensions, and generation prompts live in `docs/asset-prompts.md`.

Reusable responsibilities remain separated:

- Runtime status renders backend and precision.
- Suggested actions derive and render the next useful operations.
- Model selection owns compatibility, size, license, and warning copy.
- The dropzone owns file input, drag, drop, and paste behavior.
- The main application coordinates image history and processing handlers.

## Implementation Scope

- `src/lib/models.ts`: correct model IDs; add revision, profile, precision, and warning metadata.
- `src/lib/worker.ts`: detect structured capabilities, request the high-performance adapter, pass pinned revisions, and preserve fallback behavior.
- `src/lib/engine.ts`: expose structured device capabilities.
- `src/App.tsx`: display execution details and derive suggested actions.
- `src/components/ModelPicker.tsx`: show model profile, license, size, and compatibility warnings.
- `README.md`: document the open-source catalog, download strategy, and backend selection.

## Verification

- Production build and lint pass.
- Device status is correct with and without WebGPU.
- Every catalog model resolves at its pinned Hugging Face revision.
- Background removal works with MODNet and both BiRefNet profiles.
- Both upscalers preserve alpha and produce the expected dimensions.
- A cached model can run again without downloading its weights.
- Crop, undo, trim, export, and WASM fallback retain their existing behavior.
