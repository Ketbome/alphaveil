import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Code2, Columns2, Crop, Focus, MonitorDown, MousePointerClick, PaintBucket, Paintbrush, Plus, X, Download, Eraser, HardDrive, Languages, Loader2, LockKeyhole, Monitor, Moon, Scissors, Settings2, Sparkles, Sun, Trash2, Undo2,
} from 'lucide-react'
import type { Area } from 'react-easy-crop'
import { engine, type Progress } from './lib/engine'
import type { Bitmap, Box, Point, Status } from './lib/worker'
import { BG_MODELS, MATTE_MODEL, NO_RUNTIME, SAM_MODEL, SR_MODELS, SR_SCALE, helperDevice, isGpuLimit, isGpuLost, modelAvailable, modelDevice, modelDtype, type ModelSpec, type Runtime, type Tier } from './lib/models'
import { MAX_SIDE_OUT, composeBackdrop, cropBitmap, download, exportBlob, fileToBitmap, formatBytes, inspectAlpha, resizeBitmap, smartCrop, toObjectUrl, toThumbnailDataUrl } from './lib/image'
import { zipSync } from 'fflate'
import { useTheme, type Theme } from './lib/theme'
import { compareBase, lastOpaque, trimHistory, type Step, type StepKind } from './lib/history'
import { useInstallPrompt } from './lib/install'
import { LANGS, useI18n, type Lang } from './i18n'
import { Dropzone } from './components/Dropzone'
import { CropDialog } from './components/CropDialog'
import { Tooltip } from './components/Tooltip'
import { Popover } from './components/Popover'
import { ModelPicker } from './components/ModelPicker'
import { RuntimeStatus } from './components/RuntimeStatus'
import { ImageQueue } from './components/ImageQueue'
import { SuggestedActions, type SuggestedAction } from './components/SuggestedActions'
import { Logo } from './components/Logo'
import { CompareView } from './components/CompareView'
import { MaskEditor, type Mode as RetouchMode } from './components/MaskEditor'
import { Showcase } from './components/Showcase'
import { QualityChip } from './components/QualityChip'

type Format = 'png' | 'jpeg' | 'webp'

interface Item {
  id: string
  name: string
  history: Step[]
  thumbnail: string
}

export const MAX_IMAGES = 8

const stored = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

const storedModel = (key: string, models: ModelSpec[], fallback: string) => {
  const value = stored(key, fallback)
  return models.some((model) => model.id === value) ? value : fallback
}

// No saved preference: start on the finest cutout this machine can actually run.
const TIERS: Tier[] = ['max', 'best', 'balanced', 'fast']
const bestAvailable = (runtime: Runtime) =>
  TIERS.map((tier) => BG_MODELS.find((m) => m.tier === tier && modelAvailable(m, runtime))).find(Boolean) ?? BG_MODELS[0]

const blockedModels = () => {
  try { return JSON.parse(localStorage.getItem('gpuBlocked') ?? '[]') as string[] } catch { return [] }
}

export default function App() {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [bgModel, setBgModel] = useState(() => storedModel('bgModel', BG_MODELS, ''))
  const [srModel, setSrModel] = useState(() => storedModel('srModel', SR_MODELS, SR_MODELS[0].id))
  const [items, setItems] = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [compare, setCompare] = useState(true)
  const [retouching, setRetouching] = useState<RetouchMode | null>(null)
  const [tipSeen, setTipSeen] = useState(() => stored('tipSeen', '') === '1')
  const [preview, setPreview] = useState<string>('checker')
  const [format, setFormat] = useState<Format>('png')
  const [quality, setQuality] = useState(0.92)
  const [maxBytes, setMaxBytes] = useState<number | null>(null)
  const [backdrop, setBackdrop] = useState<{ mode: 'color' | 'blur'; color: string; blur: number; shadow: boolean }>({ mode: 'color', color: '#f3efe6', blur: 24, shadow: true })

  const addInput = useRef<HTMLInputElement>(null)
  const active = items.find((i) => i.id === activeId) ?? null
  const current = active?.history.at(-1)?.bitmap ?? null
  const before = active ? compareBase(active.history) : null
  const blurSource = active ? lastOpaque(active.history, (b) => !inspectAlpha(b).transparent) : null
  const install = useInstallPrompt()
  const canCompare = !!before
  const { transparent, trimmable, opaqueFraction, bounds } = useMemo(() => {
    if (!current) return { transparent: false, trimmable: false, opaqueFraction: 0, bounds: null }
    let n = 0
    for (let i = 3; i < current.data.length; i += 4) if (current.data[i] > 127) n++
    return { ...inspectAlpha(current), opaqueFraction: n / (current.width * current.height) }
  }, [current])
  const requestedBg = BG_MODELS.find((model) => model.id === bgModel) ?? (runtime ? bestAvailable(runtime) : BG_MODELS[0])
  const selectedBg = runtime && !modelAvailable(requestedBg, runtime)
    ? BG_MODELS.find((model) => modelAvailable(model, runtime)) ?? BG_MODELS[0]
    : requestedBg
  const selectedSr = SR_MODELS.find((model) => model.id === srModel) ?? SR_MODELS[0]
  const bgDtype = runtime ? modelDtype(selectedBg, runtime) : undefined
  const bgDevice = runtime ? modelDevice(selectedBg, runtime) : undefined

  useEffect(() => {
    engine.detectDevice().then((r) => setRuntime({ ...r, blocked: blockedModels() })).catch(() => setRuntime(NO_RUNTIME))
  }, [])
  useEffect(() => { try { localStorage.setItem('srModel', srModel) } catch { /* private mode */ } }, [srModel])

  const chooseBg = (id: string) => {
    setBgModel(id)
    try { localStorage.setItem('bgModel', id) } catch { /* private mode */ }
  }

  const unblockGpu = (id: string) => {
    const rt = runtime ?? NO_RUNTIME
    const blocked = (rt.blocked ?? []).filter((b) => b !== id)
    try { localStorage.setItem('gpuBlocked', JSON.stringify(blocked)) } catch { /* private mode */ }
    setRuntime({ ...rt, blocked })
  }

  const blockGpu = (id: string, rt: Runtime) => {
    const blocked = [...(rt.blocked ?? []), id]
    try { localStorage.setItem('gpuBlocked', JSON.stringify(blocked)) } catch { /* private mode */ }
    setRuntime({ ...rt, blocked })
    return { ...rt, blocked }
  }

  // Some GPUs expose fewer storage buffers than a model's shaders need. The limit
  // only shows up when the model runs, so move that model to WASM and try once more.
  const onGpuLimit = async <T,>(id: string, fn: (rt: Runtime) => Promise<T>) => {
    const rt = runtime ?? NO_RUNTIME
    try {
      return await fn(rt)
    } catch (e) {
      // The device went away and the worker dropped every session built on it. The
      // machine is still capable, so rebuild and run once more instead of blaming the
      // model: blocking it here would move it to the CPU on every later visit.
      if (isGpuLost(e)) return await fn(rt)
      if (!isGpuLimit(e) || rt.blocked?.includes(id)) throw e
      return await fn(blockGpu(id, rt))
    }
  }

  const pushTo = (id: string | null, b: Bitmap, kind: StepKind, origin?: Bitmap) => {
    setItems((list) => list.map((i) => {
      if (i.id !== id) return i
      const step: Step = { bitmap: b, kind, origin: origin ?? i.history.at(-1)!.origin }
      return { ...i, history: trimHistory([...i.history, step]), thumbnail: toThumbnailDataUrl(b) }
    }))
  }
  const push = (b: Bitmap, kind: StepKind, origin?: Bitmap) => pushTo(activeId, b, kind, origin)

  // Crops and trims reframe the tracked original the same way, so the comparison
  // stays aligned. Until something is actually done to the photo the two match,
  // and there is nothing to compare.
  const reframe = (kind: 'crop' | 'trim', x: number, y: number, w: number, h: number) => {
    const prev = active!.history.at(-1)!
    const b = cropBitmap(prev.bitmap, x, y, w, h)
    push(b, kind, prev.bitmap === prev.origin ? b : cropBitmap(prev.origin, x, y, w, h))
  }
  const undo = () => {
    setItems((list) => list.map((i) => {
      if (i.id !== activeId || i.history.length < 2) return i
      const history = i.history.slice(0, -1)
      return { ...i, history, thumbnail: toThumbnailDataUrl(history.at(-1)!.bitmap) }
    }))
  }
  const remove = (id: string) => {
    if (id === activeId) {
      const gone = items.findIndex((i) => i.id === id)
      const next = items.filter((i) => i.id !== id)
      setActiveId(next[Math.min(gone, next.length - 1)]?.id ?? null)
    }
    setItems((list) => list.filter((i) => i.id !== id))
  }

  const errorText = (e: unknown) =>
    e instanceof Error ? (e.name === 'EngineDead' ? t.errors.engineDied : e.message) : String(e)

  const onStatus = (s: Status) => setBusy(s.key === 'segmenting' ? t.busy.segmenting : s.key === 'matting' ? t.busy.matting : t.busy.upscaling(s.done, s.total))

  const run = async (kind: StepKind, fn: () => Promise<Bitmap>, origin?: (result: Bitmap) => Bitmap) => {
    setBusy(t.busy.loading)
    setError(null)
    try {
      const out = await fn()
      push(out, kind, origin?.(out))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  // Decoding is async, so two drops (or a drop and a paste) would both measure an
  // empty queue and both fill it. Slots are claimed before the first await instead.
  const claimed = useRef(0)
  useEffect(() => { claimed.current = items.length }, [items])
  const addFiles = async (files: File[]) => {
    setError(null)
    const images = files.filter((f) => f.type.startsWith('image/'))
    const room = Math.max(0, MAX_IMAGES - claimed.current)
    if (images.length > room) setError(t.errors.tooMany(MAX_IMAGES))
    const taken = images.slice(0, room)
    claimed.current += taken.length
    const added: Item[] = []
    for (const file of taken) {
      try {
        const bmp = await fileToBitmap(file)
        added.push({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), history: [{ bitmap: bmp, kind: 'source', origin: bmp }], thumbnail: toThumbnailDataUrl(bmp) })
      } catch {
        claimed.current--
        setError(t.errors.unsupported(file.name))
      }
    }
    if (!added.length) return
    setItems((list) => [...list, ...added])
    if (!activeId) setActiveId(added[0].id)
  }

  const onFiles = useRef(addFiles)
  useEffect(() => { onFiles.current = addFiles })
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) void onFiles.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const loadBg = async (rt: Runtime, spec: ModelSpec = selectedBg) => {
    if (!modelAvailable(spec, rt)) throw new Error(t.errors.gpuLimit(spec.name))
    const dtype = modelDtype(spec, rt)
    const device = modelDevice(spec, rt)
    setBusy(t.busy.preparing(spec.name, device.toUpperCase(), dtype.toUpperCase()))
    await engine.load('bg', spec.id, spec.revision, device, dtype, setProgress)
    setProgress(null)
  }

  const retryWith = (id: string) => {
    const spec = BG_MODELS.find((m) => m.id === id)
    const base = active?.history.at(-2)?.bitmap
    if (!spec || !base) return
    chooseBg(id)
    undo()
    void run('bg', () => onGpuLimit(spec.id, async (rt) => {
      await loadBg(rt, spec)
      return engine.removeBg(base, onStatus)
    }))
  }

  const removeBg = () => run('bg', () => onGpuLimit(selectedBg.id, async (rt) => {
    await loadBg(rt)
    return engine.removeBg(current!, onStatus)
  }))

  const detectInArea = async (crop: Bitmap) => {
    try {
      return await onGpuLimit(selectedBg.id, async (rt) => {
        await loadBg(rt)
        return engine.removeBg(crop, () => {})
      })
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const samImage = useRef<Bitmap | null>(null)
  const samEmbed = async (image: Bitmap, on?: Runtime) => {
    samImage.current = image
    const embed = (rt: Runtime) => engine.samEmbed(image, helperDevice(SAM_MODEL.id, rt), setProgress, () => {})
    try {
      if (on) await embed(on)
      else await onGpuLimit(SAM_MODEL.id, embed)
    } finally { setProgress(null) }
  }
  // A prompt that blows the GPU limit drops the session in the worker, so every later
  // click has nothing to run against. Move the model to WASM when that was the cause,
  // embed the same image again and retry once.
  const samMask = async (points: Point[], box: Box | null) => {
    try {
      return await engine.samMask(points, box)
    } catch (e) {
      const image = samImage.current
      const rt = runtime ?? NO_RUNTIME
      const limit = isGpuLimit(e)
      if (!image || (limit && rt.blocked?.includes(SAM_MODEL.id))) throw e
      await samEmbed(image, limit ? blockGpu(SAM_MODEL.id, rt) : undefined)
      return engine.samMask(points, box)
    }
  }
  const matte = async (image: Bitmap) => {
    try {
      return await onGpuLimit(MATTE_MODEL.id, (rt) => engine.matte(image, helperDevice(MATTE_MODEL.id, rt), setProgress, () => {}))
    } finally { setProgress(null) }
  }

  const pendingBg = items.filter((i) => !inspectAlpha(i.history.at(-1)!.bitmap).transparent)
  const removeBgAll = async () => {
    setError(null)
    setBusy(t.busy.loading)
    try {
      await onGpuLimit(selectedBg.id, async (rt) => {
        await loadBg(rt)
        for (const [n, item] of pendingBg.entries()) {
          setActiveId(item.id)
          setBusy(t.batch.progress(n + 1, pendingBg.length))
          const out = await engine.removeBg(item.history.at(-1)!.bitmap, () => {})
          pushTo(item.id, out, 'bg')
        }
      })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const exportOpts = () => ({ format, quality, maxBytes, background: format === 'jpeg' ? '#ffffff' : preview === 'checker' ? null : preview })
  const ext = format === 'jpeg' ? 'jpg' : format

  const downloadAll = async () => {
    setBusy(t.batch.progress(0, items.length))
    try {
      const files: Record<string, Uint8Array> = {}
      for (const [n, item] of items.entries()) {
        setBusy(t.batch.progress(n + 1, items.length))
        const blob = await exportBlob(item.history.at(-1)!.bitmap, exportOpts())
        files[`${item.name}-alphaveil.${ext}`] = new Uint8Array(await blob.arrayBuffer())
      }
      download(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), 'alphaveil.zip')
    } catch {
      setError(t.errors.export)
    } finally {
      setBusy(null)
    }
  }

  const frameTo = (aspect: number | null) => {
    const r = smartCrop(current!, aspect)
    if (r) reframe('crop', r.x, r.y, r.width, r.height)
  }

  const applyBackdrop = () => {
    push(composeBackdrop(current!, { ...backdrop, source: blurSource }), 'compose')
  }

  const upscale = () => run('upscale', () => onGpuLimit(selectedSr.id, async (rt) => {
    const dtype = modelDtype(selectedSr, rt)
    const device = modelDevice(selectedSr, rt)
    setBusy(t.busy.preparing(selectedSr.name, device.toUpperCase(), dtype.toUpperCase()))
    await engine.load('sr', selectedSr.id, selectedSr.revision, device, dtype, setProgress)
    setProgress(null)
    return engine.upscale(current!, SR_SCALE[selectedSr.id], onStatus)
  }), (out) => resizeBitmap(active!.history.at(-1)!.origin, out.width, out.height))

  const openCrop = async () => setCropSrc(await toObjectUrl(current!))
  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }
  const applyCrop = (a: Area) => {
    closeCrop()
    reframe('crop', Math.round(a.x), Math.round(a.y), Math.round(a.width), Math.round(a.height))
  }

  const save = async () => {
    try {
      const blob = await exportBlob(current!, exportOpts())
      download(blob, `${active!.name}-alphaveil.${ext}`)
    } catch {
      setError(t.errors.export)
    }
  }

  const scale = SR_SCALE[srModel]
  const tooBigToUpscale = !!current && Math.max(current.width, current.height) * scale > MAX_SIDE_OUT
  const disabled = !current || !!busy || !runtime
  const suggestions: SuggestedAction[] = []
  if (current && !transparent) {
    suggestions.push({ id: 'remove-bg', label: t.tool.removeBg, detail: selectedBg.name, icon: <Eraser className="size-3.5" />, onClick: removeBg, primary: true })
  }
  if (current && Math.max(current.width, current.height) < 1024 && scale === 2) {
    suggestions.push({ id: 'upscale', label: t.tool.upscale(2), detail: selectedSr.name, icon: <Sparkles className="size-3.5" />, onClick: upscale })
  }
  const lastKind = active?.history.at(-1)?.kind
  const bestId = BG_MODELS.find((m) => m.tier === 'best' && runtime && modelAvailable(m, runtime))?.id
  if (current && lastKind === 'bg' && opaqueFraction > 0.6 && (selectedBg.tier === 'fast' || selectedBg.tier === 'balanced') && bestId) {
    suggestions.push({ id: 'retry-best', label: t.quality.retryBest, detail: t.quality.retryBestDetail, icon: <Sparkles className="size-3.5" />, onClick: () => retryWith(bestId), primary: true })
  }
  if (current && (lastKind === 'bg' || !transparent)) {
    suggestions.push({ id: 'pick-object', label: t.quality.pickObject, detail: t.quality.pickObjectDetail, icon: <MousePointerClick className="size-3.5" />, onClick: () => setRetouching('select') })
  }
  if (current && trimmable) {
    suggestions.push({ id: 'trim', label: t.tool.trim, detail: t.tool.trimDetail, icon: <Scissors className="size-3.5" />, onClick: () => bounds && reframe('trim', bounds.x, bounds.y, bounds.width, bounds.height) })
  }

  const exportMenu = (
        <Popover trigger={({ open }) => (
          <button type="button" className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-line ${open ? 'bg-line' : ''}`}><Settings2 className="size-4" />{t.tool.export}</button>
        )}>
          <div className="w-64 space-y-3 text-sm">
            <label className="block">
              <span className="text-xs text-muted">{t.exportOpts.format}</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as Format)} className="mt-1 w-full rounded-md border border-line bg-ink px-2 py-1.5">
                <option value="png">{t.exportOpts.png}</option>
                <option value="webp">{t.exportOpts.webp}</option>
                <option value="jpeg">{t.exportOpts.jpg}</option>
              </select>
            </label>
            {format !== 'png' && (
              <label className="block">
                <span className="text-xs text-muted">{t.exportOpts.quality(Math.round(quality * 100))}</span>
                <input type="range" min={0.5} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-1 w-full accent-accent-solid" />
              </label>
            )}
            {format !== 'png' && (
              <label className="block">
                <span className="text-xs text-muted">{t.exportOpts.maxSize}</span>
                <select value={maxBytes ?? ''} onChange={(e) => setMaxBytes(e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full rounded-md border border-line bg-ink px-2 py-1.5">
                  <option value="">{t.exportOpts.noLimit}</option>
                  <option value={200 * 1024}>200 KB</option>
                  <option value={500 * 1024}>500 KB</option>
                  <option value={1024 * 1024}>1 MB</option>
                </select>
              </label>
            )}
            <div>
              <span className="text-xs text-muted">{t.exportOpts.background}</span>
              <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label={t.exportOpts.background}>
                {['checker', '#ffffff', '#000000', '#0ea5e9', '#f43f5e', '#facc15'].map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={preview === c} onClick={() => setPreview(c)} aria-label={c === 'checker' ? t.exportOpts.checker : c}
                    className={`size-7 rounded-md border-2 ${preview === c ? 'border-accent' : 'border-line'} ${c === 'checker' ? 'checker' : ''}`}
                    style={c === 'checker' ? undefined : { background: c }} />
                ))}
                <input type="color" value={preview === 'checker' ? '#ffffff' : preview} onChange={(e) => setPreview(e.target.value)} aria-label={t.exportOpts.background} className="size-7 cursor-pointer rounded-md border-2 border-line bg-transparent" />
              </div>
            </div>
          </div>
        </Popover>
  )

  const themeIcon = theme === 'dark' ? <Moon className="size-5" /> : theme === 'light' ? <Sun className="size-5" /> : <Monitor className="size-5" />

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-line bg-ink/95 px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-[1.35rem] leading-none tracking-tight">{t.appName}</span>
          <span className="hidden border-l border-line pl-2 text-xs text-dim md:inline">{t.tagline}</span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1.5">
          <span className="hidden sm:inline-flex"><RuntimeStatus runtime={runtime} dtype={bgDtype} device={bgDevice} /></span>
          {install.available && (
            <Popover trigger={() => (
              <Tooltip label={t.install.button}><button type="button" className="rounded-md p-1.5 text-accent hover:bg-line" aria-label={t.install.button}><MonitorDown className="size-5" /></button></Tooltip>
            )}>
              {(close) => (
                <div className="w-64 space-y-3 text-sm">
                  <p className="text-xs leading-snug text-muted">{t.install.hint}</p>
                  {install.canPrompt ? (
                    <button type="button" onClick={() => { install.prompt(); close() }} className="w-full rounded-lg bg-accent-solid px-3 py-2 text-sm font-semibold text-on-accent hover:brightness-110">{t.install.button}</button>
                  ) : (
                    <p className="text-xs leading-snug">{t.install.ios}</p>
                  )}
                </div>
              )}
            </Popover>
          )}
          <Popover trigger={() => (
            <Tooltip label={t.language}><button type="button" className="rounded-md p-1.5 hover:bg-line" aria-label={t.language}><Languages className="size-5" /></button></Tooltip>
          )}>
            {(close) => (
              <ul className="w-40" role="listbox" aria-label={t.language}>
                {LANGS.map((l) => (
                  <li key={l.code}>
                    <button type="button" role="option" aria-selected={l.code === lang} onClick={() => { setLang(l.code as Lang); close() }}
                      className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-line ${l.code === lang ? 'text-accent font-semibold' : ''}`}>
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
          <Popover trigger={() => (
            <Tooltip label={t.theme.label}><button type="button" className="rounded-md p-1.5 hover:bg-line" aria-label={t.theme.label}>{themeIcon}</button></Tooltip>
          )}>
            {(close) => (
              <ul className="w-40" role="listbox" aria-label={t.theme.label}>
                {(['light', 'dark', 'system'] as Theme[]).map((v) => (
                  <li key={v}>
                    <button type="button" role="option" aria-selected={v === theme} onClick={() => { setTheme(v); close() }}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-line ${v === theme ? 'text-accent font-semibold' : ''}`}>
                      {v === 'light' ? <Sun className="size-4" /> : v === 'dark' ? <Moon className="size-4" /> : <Monitor className="size-4" />}{t.theme[v]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
          <Popover className="max-h-[calc(100dvh-4rem)] overflow-y-auto" trigger={() => (
            <Tooltip label={t.models.open}><button type="button" className="rounded-md p-1.5 hover:bg-line" aria-label={t.models.open}><Settings2 className="size-5" /></button></Tooltip>
          )}>
            <div className="flex w-[min(22rem,calc(100vw-3.5rem))] min-w-0 flex-col gap-4">
              <ModelPicker title={t.models.bg} models={BG_MODELS} value={selectedBg.id} runtime={runtime ?? NO_RUNTIME} onChange={chooseBg} onUnblock={unblockGpu} />
              <ModelPicker title={t.models.sr} models={SR_MODELS} value={srModel} runtime={runtime ?? NO_RUNTIME} onChange={setSrModel} onUnblock={unblockGpu} />
              <p className="px-1 text-[11px] leading-snug text-dim">{t.models.note}</p>
            </div>
          </Popover>
          <a href="https://github.com/ketbome/alphaveil" target="_blank" rel="noreferrer" className="rounded-md p-1.5 hover:bg-line" aria-label="GitHub">
            <Code2 className="size-5" />
          </a>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {!active ? (
          <div className="relative flex flex-1 overflow-x-hidden overflow-y-auto">
            <div className="workspace-grid pointer-events-none absolute inset-0" />
            <div className="relative mx-auto grid w-full max-w-6xl items-center gap-6 px-4 py-5 sm:px-5 sm:py-8 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-28 lg:px-20 lg:py-24">
              <section className="order-last min-w-0 max-w-lg lg:order-none">
                <div className="rise mb-5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{t.hero.kicker}</div>
                <h1 className="rise max-w-md font-display text-4xl leading-[0.92] tracking-[-0.02em] sm:text-6xl lg:text-7xl">
                  {t.hero.title1}<br /><span className="italic text-accent">{t.hero.title2}</span>
                </h1>
                <p className="rise mt-5 max-w-md text-sm leading-relaxed text-muted sm:text-base" style={{ animationDelay: '120ms' }}>{t.hero.body}</p>
                <div className="rise mt-7 flex max-w-md flex-col divide-y divide-line border-y border-line text-xs">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <span className="flex items-center gap-2 text-muted"><HardDrive className="size-4" />{t.hero.engine}</span>
                    <RuntimeStatus runtime={runtime} dtype={bgDtype} device={bgDevice} />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <span className="flex items-center gap-2 text-muted"><LockKeyhole className="size-4" />{t.hero.privacy}</span>
                    <span className="font-mono text-[10px] text-fg/80">{t.hero.local}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <span className="text-muted">{t.quality.label}</span>
                    <QualityChip value={selectedBg} runtime={runtime ?? NO_RUNTIME} onChange={chooseBg} onUnblock={unblockGpu} compact />
                  </div>
                </div>
              </section>
              <div className="rise min-w-0 lg:relative" style={{ animationDelay: '200ms' }}>
                <Dropzone onFiles={addFiles} />
                <Showcase />
              </div>
            </div>
            {error && <p role="alert" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-danger/30 bg-panel px-3 py-1.5 text-xs text-danger shadow">{error}</p>}
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-2 sm:px-3" role="toolbar" aria-label={t.appName}>
              <Tool label={t.tool.cropHint} onClick={() => void openCrop()} disabled={disabled} icon={<Crop className="size-4" />} text={t.tool.crop} />
              <Tool label={t.tool.removeBgHint(selectedBg.name)} onClick={removeBg} disabled={disabled} icon={<Eraser className="size-4" />} text={t.tool.removeBg} primary />
              <QualityChip value={selectedBg} runtime={runtime ?? NO_RUNTIME} onChange={chooseBg} onUnblock={unblockGpu} compact />
              <Tool label={tooBigToUpscale ? t.tool.upscaleTooBig(MAX_SIDE_OUT) : t.tool.upscaleHint(scale, selectedSr.name)} onClick={upscale} disabled={disabled || tooBigToUpscale} icon={<Sparkles className="size-4" />} text={t.tool.upscale(scale)} />
              <Tool label={t.tool.trimHint} onClick={() => bounds && reframe('trim', bounds.x, bounds.y, bounds.width, bounds.height)} disabled={disabled || !trimmable} icon={<Scissors className="size-4" />} text={t.tool.trim} />
              <Tool label={t.retouch.hint} onClick={() => setRetouching('erase')} disabled={disabled} icon={<Paintbrush className="size-4" />} text={t.retouch.title} />
              <Popover placement="bottom-start" trigger={({ open }) => (
                <Tooltip label={transparent ? t.frame.hint : t.frame.needsAlpha} placement="bottom">
                  <button type="button" disabled={disabled || !transparent} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-40 ${open ? 'bg-line' : 'hover:bg-line'}`}>
                    <Focus className="size-4" />{t.frame.title}
                  </button>
                </Tooltip>
              )}>
                {(close) => (
                  <div className="grid w-44 grid-cols-2 gap-1">
                    {([['free', null], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9]] as [string, number | null][]).map(([label, aspect]) => (
                      <button key={label} type="button" onClick={() => { frameTo(aspect); close() }} className="rounded-md border border-line px-2 py-1.5 text-xs hover:border-accent hover:text-accent">
                        {label === 'free' ? t.frame.free : label}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
              <Popover placement="bottom-start" trigger={({ open }) => (
                <Tooltip label={transparent ? t.backdrop.hint : t.frame.needsAlpha} placement="bottom">
                  <button type="button" disabled={disabled || !transparent} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-40 ${open ? 'bg-line' : 'hover:bg-line'}`}>
                    <PaintBucket className="size-4" />{t.backdrop.title}
                  </button>
                </Tooltip>
              )}>
                {(close) => (
                  <div className="w-64 space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-1" role="radiogroup">
                      <button type="button" role="radio" aria-checked={backdrop.mode === 'color'} onClick={() => setBackdrop({ ...backdrop, mode: 'color' })} className={`rounded-md border px-2 py-1.5 text-xs ${backdrop.mode === 'color' ? 'border-accent text-accent' : 'border-line'}`}>{t.backdrop.color}</button>
                      <button type="button" role="radio" aria-checked={backdrop.mode === 'blur'} disabled={!blurSource} onClick={() => setBackdrop({ ...backdrop, mode: 'blur' })} className={`rounded-md border px-2 py-1.5 text-xs disabled:opacity-40 ${backdrop.mode === 'blur' ? 'border-accent text-accent' : 'border-line'}`}>{t.backdrop.blur}</button>
                    </div>
                    {backdrop.mode === 'color' ? (
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted">{t.backdrop.color}</span>
                        <input type="color" value={backdrop.color} onChange={(e) => setBackdrop({ ...backdrop, color: e.target.value })} className="size-8 cursor-pointer rounded-md border-2 border-line bg-transparent" />
                      </label>
                    ) : (
                      <label className="block">
                        <span className="text-xs text-muted">{t.backdrop.blurAmount} {backdrop.blur}</span>
                        <input type="range" min={4} max={60} value={backdrop.blur} onChange={(e) => setBackdrop({ ...backdrop, blur: Number(e.target.value) })} className="mt-1 w-full accent-accent-solid" />
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={backdrop.shadow} onChange={(e) => setBackdrop({ ...backdrop, shadow: e.target.checked })} className="accent-accent-solid" />
                      {t.backdrop.shadow}
                    </label>
                    <button type="button" onClick={() => { applyBackdrop(); close() }} className="w-full rounded-lg bg-accent-solid px-3 py-2 text-sm font-semibold text-on-accent hover:brightness-110">{t.backdrop.apply}</button>
                  </div>
                )}
              </Popover>
              <span className="mx-1 hidden h-5 w-px bg-line md:inline" />
              <Tool label={t.compare.hint} onClick={() => setCompare((v) => !v)} disabled={!canCompare || !!busy} icon={<Columns2 className="size-4" />} text={t.compare.toggle} active={compare && canCompare} />
              <Tool label={t.tool.undo} onClick={undo} disabled={(active.history.length ?? 0) < 2 || !!busy} icon={<Undo2 className="size-4" />} />
              <Tool label={t.tool.remove} onClick={() => remove(active.id)} disabled={!!busy} icon={<Trash2 className="size-4" />} />
              <div className="ml-auto hidden shrink-0 items-center gap-1 md:flex">
                {exportMenu}
                <button type="button" onClick={save} disabled={disabled} className="flex items-center gap-1.5 rounded-lg bg-accent-solid px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-40">
                  <Download className="size-4" />{t.tool.download}
                </button>
              </div>
            </div>

            <SuggestedActions actions={suggestions} disabled={disabled} />
            {!tipSeen && lastKind === 'bg' && (
              <div role="note" className="flex items-center gap-3 border-b border-accent/30 bg-accent/8 px-4 py-2 text-xs text-fg">
                <Sparkles className="size-4 shrink-0 text-accent" />
                <span className="flex-1">{t.quality.tip}</span>
                <button type="button" onClick={() => { setTipSeen(true); try { localStorage.setItem('tipSeen', '1') } catch { /* private mode */ } }} className="flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-accent hover:bg-line">{t.quality.gotIt}<X className="size-3.5" /></button>
              </div>
            )}

            <div className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 [container-type:size] ${preview === 'checker' ? 'checker' : ''}`} style={preview === 'checker' ? undefined : { background: preview }}>
              {current && (compare && before ? <CompareView key={active.id + active.history.length} before={before} after={current} /> : <PreviewCanvas key={active.id + active.history.length} bitmap={current} label={t.preview(active.name)} />)}
              <ImageQueue items={items.map((i) => ({ id: i.id, name: i.name, thumbnail: i.thumbnail, steps: i.history.length }))} activeId={activeId} disabled={!!busy} max={MAX_IMAGES} onSelect={setActiveId} onRemove={remove} onFiles={addFiles} pendingBg={pendingBg.length} onRemoveAllBg={removeBgAll} onZip={downloadAll} />
              <input ref={addInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/70 backdrop-blur-sm" role="status" aria-live="polite">
                  <div className="scanline pointer-events-none absolute inset-y-0 w-40" aria-hidden="true" />
                  <Loader2 className="size-8 animate-spin text-accent" />
                  <div className="text-sm">{busy}</div>
                  {progress && (
                    <div className="w-72 text-xs text-muted">
                      <div className="mb-1 flex justify-between"><span className="truncate">{progress.file.split('/').pop()}</span><span>{formatBytes(progress.loaded)} / {formatBytes(progress.total)}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent-solid transition-all" style={{ width: `${progress.progress}%` }} /></div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-4 overflow-x-auto border-t border-line px-3 py-1.5 font-mono text-[10px] text-dim sm:px-4">
              <span className="shrink-0">{current!.width} × {current!.height} PX{transparent ? ` · ${t.footer.alpha}` : ''} · {t.footer.step(active.history.length)}</span>
              {error ? <span role="alert" className="shrink-0 text-danger">{error}</span> : <span className="hidden shrink-0 sm:inline">{t.footer.limit}</span>}
              <span className="sm:hidden"><RuntimeStatus runtime={runtime} dtype={bgDtype} device={bgDevice} /></span>
            </footer>
            <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
              <button type="button" onClick={() => addInput.current?.click()} disabled={!!busy || items.length >= MAX_IMAGES} aria-label={t.queue.addHint}
                className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-accent disabled:opacity-40">
                <Plus className="size-5" />
              </button>
              {exportMenu}
              <button type="button" onClick={save} disabled={disabled} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-solid px-3 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-40">
                <Download className="size-4" />{t.tool.download}
              </button>
            </div>
          </>
        )}
      </main>

      {cropSrc && <CropDialog src={cropSrc} onCancel={closeCrop} onApply={applyCrop} />}
      {retouching && current && <MaskEditor bitmap={current} source={blurSource} initialMode={retouching === 'erase' && !transparent ? 'select' : retouching} onCancel={() => setRetouching(null)} onApply={(b) => { setRetouching(null); push(b, 'retouch') }} onDetect={detectInArea} onSamEmbed={samEmbed} onSamMask={samMask} onMatte={matte} />}
    </div>
  )
}

function PreviewCanvas({ bitmap, label }: { bitmap: Bitmap; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.putImageData(new ImageData(bitmap.data as Uint8ClampedArray<ArrayBuffer>, bitmap.width, bitmap.height), 0, 0)
  }, [bitmap])
  return <canvas ref={ref} role="img" aria-label={label} className="pop max-h-full max-w-full object-contain shadow-2xl shadow-black/30" />
}

function Tool({ label, onClick, disabled, icon, text, primary, active }: { label: string; onClick: () => void; disabled?: boolean; icon: ReactNode; text?: string; primary?: boolean; active?: boolean }) {
  return (
    <Tooltip label={label} placement="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={text ? undefined : label}
        aria-pressed={active}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition active:translate-y-px disabled:opacity-40 ${primary ? 'bg-accent/15 text-accent hover:bg-accent/25' : active ? 'bg-line text-accent' : 'hover:bg-line'}`}
      >
        {icon}{text}
      </button>
    </Tooltip>
  )
}
