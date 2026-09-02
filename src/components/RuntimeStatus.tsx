import { Cpu, Loader2, Zap } from 'lucide-react'
import type { DType, Device, Runtime } from '../lib/models'
import { useI18n } from '../i18n'
import { Tooltip } from './Tooltip'

interface Props {
  runtime: Runtime | null
  dtype?: DType
  device?: Device
}

export function RuntimeStatus({ runtime, dtype, device }: Props) {
  const { t } = useI18n()
  if (!runtime) {
    return (
      <span className="runtime-chip text-muted" aria-live="polite">
        <Loader2 className="size-3 animate-spin" /> {t.runtime.detecting}
      </span>
    )
  }

  const effectiveDevice = device ?? runtime.device
  const webgpu = effectiveDevice === 'webgpu'
  const modelFallback = runtime.device === 'webgpu' && effectiveDevice === 'wasm'
  const detail = modelFallback
    ? t.runtime.fallback(runtime.maxStorageBuffersPerShaderStage)
    : webgpu
    ? t.runtime.webgpu(runtime.supportsFp16)
    : t.runtime.wasm

  return (
    <Tooltip label={detail}>
      <span className={`runtime-chip ${webgpu ? 'runtime-chip-active' : 'runtime-chip-fallback'}`} aria-live="polite" aria-label={detail}>
        {webgpu ? <Zap className="size-3" /> : <Cpu className="size-3" />}
        <span>{effectiveDevice.toUpperCase()}</span>
        {dtype ? <span className="border-l border-current/25 pl-1.5 font-mono">{dtype.toUpperCase()}</span> : null}
      </span>
    </Tooltip>
  )
}
