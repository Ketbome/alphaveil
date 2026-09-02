export type Device = 'webgpu' | 'wasm'
export type DType = 'fp16' | 'fp32' | 'q8'

export interface Runtime {
  device: Device
  supportsFp16: boolean
  maxStorageBuffersPerShaderStage: number
  // Models that blew the GPU limits at runtime on this machine; kept in localStorage.
  blocked?: string[]
}

export type Tier = 'fast' | 'balanced' | 'best' | 'max'

export interface ModelSpec {
  id: string
  tier?: Tier
  revision: string
  name: string
  license: 'Apache 2.0' | 'MIT' | 'BRIA non-commercial'
  size: Partial<Record<DType, string>>
  dtype: Record<Device, DType>
  minStorageBuffers?: number
  wasmSafe?: boolean
}

export const BG_MODELS: ModelSpec[] = [
  {
    id: 'briaai/RMBG-1.4',
    revision: '2ceba5a5efaec153162aedea169f76caf9b46cf8',
    name: 'RMBG 1.4',
    tier: 'balanced',
    license: 'BRIA non-commercial',
    size: { fp16: '88 MB', fp32: '176 MB', q8: '44 MB' },
    dtype: { webgpu: 'fp16', wasm: 'q8' },
  },
  {
    id: 'onnx-community/BiRefNet_lite-ONNX',
    revision: 'de15b22ba131738a16dff04aab8bdf8dc32e3ac1',
    name: 'BiRefNet Lite',
    tier: 'best',
    license: 'MIT',
    size: { fp16: '115 MB', fp32: '224 MB' },
    dtype: { webgpu: 'fp16', wasm: 'fp32' },
    minStorageBuffers: 11,
    wasmSafe: false,
  },
  {
    id: 'onnx-community/BiRefNet-ONNX',
    revision: '534d3c82d3bb8b2f0867db6dfbc3a525b8e42f67',
    name: 'BiRefNet',
    license: 'MIT',
    size: { fp16: '490 MB', fp32: '973 MB' },
    dtype: { webgpu: 'fp16', wasm: 'fp32' },
    minStorageBuffers: 11,
    wasmSafe: false,
  },
  {
    id: 'onnx-community/BEN2-ONNX',
    revision: 'c552aa82688edce09f0ac9d2e31ad53d9d629010',
    name: 'BEN2',
    tier: 'max',
    license: 'MIT',
    size: { fp16: '219 MB' },
    dtype: { webgpu: 'fp16', wasm: 'fp16' },
    wasmSafe: false,
  },
  {
    id: 'Xenova/modnet',
    revision: 'fa2fa546052fba4c08921230a26cc69a333fca12',
    name: 'MODNet',
    tier: 'fast',
    license: 'Apache 2.0',
    size: { fp16: '13 MB', fp32: '26 MB', q8: '6.3 MB' },
    dtype: { webgpu: 'fp16', wasm: 'q8' },
  },
]

export const SR_MODELS: ModelSpec[] = [
  {
    id: 'Xenova/swin2SR-lightweight-x2-64',
    revision: '92a21aca5713f20faf9a87590cdfbdce2e34112c',
    name: 'Swin2SR ×2',
    license: 'Apache 2.0',
    size: { fp32: '8 MB' },
    dtype: { webgpu: 'fp32', wasm: 'fp32' },
  },
  {
    id: 'onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr-ONNX',
    revision: '9b3baf051f6708d0b697580489e4415b64c7378e',
    name: 'Swin2SR ×4',
    license: 'Apache 2.0',
    size: { fp32: '54 MB' },
    dtype: { webgpu: 'fp32', wasm: 'fp32' },
  },
]

export const SR_SCALE: Record<string, number> = {
  'Xenova/swin2SR-lightweight-x2-64': 2,
  'onnx-community/swin2SR-realworld-sr-x4-64-bsrgan-psnr-ONNX': 4,
}

export const NO_RUNTIME: Runtime = { device: 'wasm', supportsFp16: false, maxStorageBuffersPerShaderStage: 0 }

export function modelDevice(model: ModelSpec, runtime: Runtime): Device {
  if (runtime.device !== 'webgpu') return runtime.device
  if (runtime.blocked?.includes(model.id)) return 'wasm'
  if (model.minStorageBuffers && runtime.maxStorageBuffersPerShaderStage < model.minStorageBuffers) return 'wasm'
  return 'webgpu'
}

export function modelAvailable(model: ModelSpec, runtime: Runtime) {
  if (modelDevice(model, runtime) === 'wasm' && model.wasmSafe === false) return false
  return modelDtype(model, runtime) in model.size
}

export function helperDevice(id: string, runtime: Runtime | null): Device {
  return runtime?.device === 'webgpu' && !runtime.blocked?.includes(id) ? 'webgpu' : 'wasm'
}

const text = (error: unknown) => (error instanceof Error ? error.message : String(error))

// onnxruntime-web aborts with this when a shader needs more storage buffers than the
// adapter exposes. The limit is fixed per GPU, so the model has to move to WASM for
// good; keep the match narrow, a false positive blocks the model on every later visit.
const GPU_LIMIT = /maxStorageBuffers|storage ?buffers?[^.]*\b(exceed\w*|maximum|limit)|\b(exceed\w*|maximum|limit)[^.]*storage ?buffers?/i

// The GPU device went away mid-run: tab backgrounded on mobile, driver reset, or the
// memory of the leaked sessions. Every session built on it is dead, but the machine is
// still capable, so these have to rebuild rather than move the model to WASM forever.
const GPU_LOST = /device (is |was )?lost|external instance|compute pipeline|destroyed/i

export function isGpuLimit(error: unknown) {
  return GPU_LIMIT.test(text(error))
}

export function isGpuLost(error: unknown) {
  const message = text(error)
  return !GPU_LIMIT.test(message) && GPU_LOST.test(message)
}

export function modelDtype(model: ModelSpec, runtime: Runtime): DType {
  const device = modelDevice(model, runtime)
  const dtype = model.dtype[device]
  return device === 'webgpu' && dtype === 'fp16' && !runtime.supportsFp16 ? 'fp32' : dtype
}

export function modelSize(model: ModelSpec, runtime: Runtime) {
  return model.size[modelDtype(model, runtime)] ?? '—'
}

// Fixed helper models (not user-selectable): click-to-select and edge matting.
export const SAM_MODEL = { id: 'onnx-community/EdgeTAM-ONNX', revision: '9c77c7bff7fd0f3079585fa17af7f730ddc531ed', name: 'EdgeTAM', size: '31 MB' }
export const MATTE_MODEL = { id: 'Xenova/vitmatte-small-composition-1k', revision: '6bc1297f6140f055a227b6d2cfe8c093281f35d2', name: 'ViTMatte', size: '104 MB (28 MB on CPU)' }
