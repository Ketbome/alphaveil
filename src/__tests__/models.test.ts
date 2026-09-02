import { describe, expect, it } from 'vitest'
import { BG_MODELS, SR_MODELS, SR_SCALE, modelAvailable, modelDevice, modelDtype, modelSize, type Runtime } from '../lib/models'

const gpu: Runtime = { device: 'webgpu', supportsFp16: true, maxStorageBuffersPerShaderStage: 16 }
const weakGpu: Runtime = { device: 'webgpu', supportsFp16: false, maxStorageBuffersPerShaderStage: 8 }
const cpu: Runtime = { device: 'wasm', supportsFp16: false, maxStorageBuffersPerShaderStage: 0 }

const byId = (id: string) => [...BG_MODELS, ...SR_MODELS].find((m) => m.id === id)!

describe('model catalog', () => {
  it('every model pins a revision and has a size for each dtype it can run with', () => {
    for (const m of [...BG_MODELS, ...SR_MODELS]) {
      expect(m.revision).toMatch(/^[0-9a-f]{40}$/)
      for (const rt of [gpu, weakGpu, cpu]) {
        if (modelAvailable(m, rt)) expect(modelSize(m, rt)).not.toBe('—')
      }
    }
  })

  it('every upscaler has a scale factor', () => {
    for (const m of SR_MODELS) expect(SR_SCALE[m.id]).toBeGreaterThan(1)
  })
})

describe('device selection', () => {
  it('uses fp16 on a capable GPU', () => {
    expect(modelDtype(byId('briaai/RMBG-1.4'), gpu)).toBe('fp16')
    expect(modelDevice(byId('onnx-community/BiRefNet-ONNX'), gpu)).toBe('webgpu')
  })

  it('falls back to fp32 when the adapter lacks shader-f16', () => {
    expect(modelDtype(byId('Xenova/modnet'), weakGpu)).toBe('fp32')
  })

  it('disables BiRefNet on GPUs with too few storage buffers instead of running it on WASM', () => {
    const lite = byId('onnx-community/BiRefNet_lite-ONNX')
    expect(modelDevice(lite, weakGpu)).toBe('wasm')
    expect(modelAvailable(lite, weakGpu)).toBe(false)
    expect(modelAvailable(byId('Xenova/modnet'), weakGpu)).toBe(true)
  })

  it('uses q8 on CPU where available', () => {
    expect(modelDtype(byId('briaai/RMBG-1.4'), cpu)).toBe('q8')
    expect(modelDtype(byId('Xenova/swin2SR-lightweight-x2-64'), cpu)).toBe('fp32')
  })

  it('always leaves at least one background model available', () => {
    for (const rt of [gpu, weakGpu, cpu]) expect(BG_MODELS.some((m) => modelAvailable(m, rt))).toBe(true)
  })
})
