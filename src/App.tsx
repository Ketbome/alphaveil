import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight, Code2, Columns2, Crop, Plus, Download, Eraser, HardDrive, Languages, Loader2, LockKeyhole, Monitor, Moon, Scissors, Settings2, Sparkles, Sun, Trash2, Undo2,
} from 'lucide-react'
import type { Area } from 'react-easy-crop'
import { engine, type Progress } from './lib/engine'
import type { Bitmap, Status } from './lib/worker'
import { BG_MODELS, NO_RUNTIME, SR_MODELS, SR_SCALE, modelAvailable, modelDevice, modelDtype, type ModelSpec, type Runtime } from './lib/models'
import { cropBitmap, download, exportBlob, fileToBitmap, formatBytes, inspectAlpha, toDataUrl, toThumbnailDataUrl, trimTransparent } from './lib/image'
import { useTheme, type Theme } from './lib/theme'
import { compareBase, type Step, type StepKind } from './lib/history'
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

type Format = 'png' | 'jpeg' | 'webp'

interface Item {
  id: string
  name: string
  history: Step[]
  thumbnail: string
}

export const MAX_IMAGES = 8
const MAX_HISTORY = 6

const stored = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

const storedModel = (key: string, models: ModelSpec[], fallback: ModelSpec) => {
  const value = stored(key, fallback.id)
  return models.some((model) => model.id === value) ? value : fallback.id
}

export default function App() {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [bgModel, setBgModel] = useState(() => storedModel('bgModel', BG_MODELS, BG_MODELS[0]))
  const [srModel, setSrModel] = useState(() => storedModel('srModel', SR_MODELS, SR_MODELS[0]))
  const [items, setItems] = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [compare, setCompare] = useState(false)
  const [preview, setPreview] = useState<string>('checker')
  const [format, setFormat] = useState<Format>('png')
  const [quality, setQuality] = useState(0.92)

  const addInput = useRef<HTMLInputElement>(null)
  const active = items.find((i) => i.id === activeId) ?? null
  const current = active?.history.at(-1)?.bitmap ?? null
  const before = active ? compareBase(active.history) : null
  const canCompare = !!before
  const { transparent, trimmable } = useMemo(() => (current ? inspectAlpha(current) : { transparent: false, trimmable: false }), [current])
  const requestedBg = BG_MODELS.find((model) => model.id === bgModel) ?? BG_MODELS[0]
  const selectedBg = runtime && !modelAvailable(requestedBg, runtime)
    ? BG_MODELS.find((model) => modelAvailable(model, runtime)) ?? BG_MODELS[0]
    : requestedBg
  const selectedSr = SR_MODELS.find((model) => model.id === srModel) ?? SR_MODELS[0]
  const bgDtype = runtime ? modelDtype(selectedBg, runtime) : undefined
  const bgDevice = runtime ? modelDevice(selectedBg, runtime) : undefined

  useEffect(() => {
    engine.detectDevice().then(setRuntime).catch(() => setRuntime(NO_RUNTIME))
  }, [])
  useEffect(() => { try { localStorage.setItem('bgModel', selectedBg.id) } catch { /* private mode */ } }, [selectedBg.id])
  useEffect(() => { try { localStorage.setItem('srModel', srModel) } catch { /* private mode */ } }, [srModel])

  const push = (b: Bitmap, kind: StepKind) => {
    setItems((list) => list.map((i) => (i.id !== activeId ? i : { ...i, history: [...i.history, { bitmap: b, kind }].slice(-MAX_HISTORY), thumbnail: toThumbnailDataUrl(b) })))
  }
  const undo = () => {
    setItems((list) => list.map((i) => {
      if (i.id !== activeId || i.history.length < 2) return i
      const history = i.history.slice(0, -1)
      return { ...i, history, thumbnail: toThumbnailDataUrl(history.at(-1)!.bitmap) }
    }))
  }
  const remove = (id: string) => {
    setItems((list) => {
      const next = list.filter((i) => i.id !== id)
      if (id === activeId) setActiveId(next[Math.min(list.findIndex((i) => i.id === id), next.length - 1)]?.id ?? null)
      return next
    })
  }

  const onStatus = (s: Status) => setBusy(s.key === 'segmenting' ? t.busy.segmenting : t.busy.upscaling(s.done, s.total))

  const run = async (kind: StepKind, fn: () => Promise<Bitmap>) => {
    setBusy(t.busy.loading)
    setError(null)
    try {
      push(await fn(), kind)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const addFiles = async (files: File[]) => {
    setError(null)
    const images = files.filter((f) => f.type.startsWith('image/'))
    const room = MAX_IMAGES - items.length
    if (images.length > room) setError(t.errors.tooMany(MAX_IMAGES))
    const added: Item[] = []
    for (const file of images.slice(0, Math.max(0, room))) {
      try {
        const bmp = await fileToBitmap(file)
        added.push({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), history: [{ bitmap: bmp, kind: 'source' }], thumbnail: toThumbnailDataUrl(bmp) })
      } catch {
        setError(t.errors.unsupported(file.name))
      }
    }
    if (!added.length) return
    setItems((list) => [...list, ...added])
    if (!activeId) setActiveId(added[0].id)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const removeBg = () => run('bg', async () => {
    const dtype = modelDtype(selectedBg, runtime!)
    const device = modelDevice(selectedBg, runtime!)
    setBusy(t.busy.preparing(selectedBg.name, device.toUpperCase(), dtype.toUpperCase()))
    await engine.load('bg', selectedBg.id, selectedBg.revision, device, dtype, setProgress)
    setProgress(null)
    return engine.removeBg(current!, onStatus)
  })

  const upscale = () => run('upscale', async () => {
    const dtype = modelDtype(selectedSr, runtime!)
    const device = modelDevice(selectedSr, runtime!)
    setBusy(t.busy.preparing(selectedSr.name, device.toUpperCase(), dtype.toUpperCase()))
    await engine.load('sr', selectedSr.id, selectedSr.revision, device, dtype, setProgress)
    setProgress(null)
    return engine.upscale(current!, SR_SCALE[selectedSr.id], onStatus)
  })

  const applyCrop = (a: Area) => {
    setCropSrc(null)
    push(cropBitmap(current!, Math.round(a.x), Math.round(a.y), Math.round(a.width), Math.round(a.height)), 'crop')
  }

  const save = async () => {
    try {
      const bg = format === 'jpeg' ? '#ffffff' : preview === 'checker' ? null : preview
      const blob = await exportBlob(current!, { format, background: bg, quality })
      download(blob, `${active!.name}-bgstudio.${format === 'jpeg' ? 'jpg' : format}`)
    } catch {
      setError(t.errors.export)
    }
  }

  const scale = SR_SCALE[srModel]
  const disabled = !current || !!busy || !runtime
  const suggestions: SuggestedAction[] = []
  if (current && !transparent) {
    suggestions.push({ id: 'remove-bg', label: t.tool.removeBg, detail: selectedBg.name, icon: <Eraser className="size-3.5" />, onClick: removeBg, primary: true })
  }
  if (current && Math.max(current.width, current.height) < 1024 && scale === 2) {
    suggestions.push({ id: 'upscale', label: t.tool.upscale(2), detail: selectedSr.name, icon: <Sparkles className="size-3.5" />, onClick: upscale })
  }
  if (current && trimmable) {
    suggestions.push({ id: 'trim', label: t.tool.trim, detail: t.tool.trimDetail, icon: <Scissors className="size-3.5" />, onClick: () => push(trimTransparent(current), 'trim') })
  }

  const themeIcon = theme === 'dark' ? <Moon className="size-5" /> : theme === 'light' ? <Sun className="size-5" /> : <Monitor className="size-5" />

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-line bg-ink/95 px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-[1.35rem] leading-none tracking-tight">{t.appName}</span>
          <span className="hidden border-l border-line pl-2 text-xs text-dim md:inline">{t.tagline}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RuntimeStatus runtime={runtime} dtype={bgDtype} device={bgDevice} />
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
              <ModelPicker title={t.models.bg} models={BG_MODELS} value={selectedBg.id} runtime={runtime ?? NO_RUNTIME} onChange={setBgModel} />
              <ModelPicker title={t.models.sr} models={SR_MODELS} value={srModel} runtime={runtime ?? NO_RUNTIME} onChange={setSrModel} />
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
          <div className="relative flex flex-1 overflow-y-auto">
            <div className="workspace-grid pointer-events-none absolute inset-0" />
            <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-5 py-8 md:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14 lg:py-10">
              <section className="max-w-lg">
                <div className="rise mb-5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{t.hero.kicker}</div>
                <h1 className="rise max-w-md font-display text-5xl leading-[0.92] tracking-[-0.02em] sm:text-6xl lg:text-7xl">
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
                    <span className="text-muted">{t.hero.recommended}</span>
                    <span className="flex items-center gap-1.5 font-medium">{selectedBg.name}<ArrowRight className="size-3.5 text-accent" /></span>
                  </div>
                </div>
              </section>
              <div className="rise" style={{ animationDelay: '200ms' }}><Dropzone onFiles={addFiles} /></div>
            </div>
            {error && <p role="alert" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-danger/30 bg-panel px-3 py-1.5 text-xs text-danger shadow">{error}</p>}
          </div>
        ) : (
          <>
            <ImageQueue items={items.map((i) => ({ id: i.id, name: i.name, thumbnail: i.thumbnail, steps: i.history.length }))} activeId={activeId} disabled={!!busy} max={MAX_IMAGES} onSelect={setActiveId} onRemove={remove} onFiles={addFiles} />

            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-3 py-2" role="toolbar" aria-label={t.appName}>
              <Tool label={t.tool.cropHint} onClick={() => setCropSrc(toDataUrl(current!))} disabled={disabled} icon={<Crop className="size-4" />} text={t.tool.crop} />
              <Tool label={t.tool.removeBgHint(selectedBg.name)} onClick={removeBg} disabled={disabled} icon={<Eraser className="size-4" />} text={t.tool.removeBg} primary />
              <Tool label={t.tool.upscaleHint(scale, selectedSr.name)} onClick={upscale} disabled={disabled} icon={<Sparkles className="size-4" />} text={t.tool.upscale(scale)} />
              <Tool label={t.tool.trimHint} onClick={() => push(trimTransparent(current!), 'trim')} disabled={disabled || !trimmable} icon={<Scissors className="size-4" />} text={t.tool.trim} />
              <span className="mx-1 h-5 w-px bg-line" />
              <Tool label={t.compare.hint} onClick={() => setCompare((v) => !v)} disabled={!canCompare || !!busy} icon={<Columns2 className="size-4" />} text={t.compare.toggle} active={compare && canCompare} />
              <Tool label={t.tool.undo} onClick={undo} disabled={(active.history.length ?? 0) < 2 || !!busy} icon={<Undo2 className="size-4" />} />
              <Tool label={t.tool.remove} onClick={() => remove(active.id)} disabled={!!busy} icon={<Trash2 className="size-4" />} />
              <div className="ml-auto flex shrink-0 items-center gap-1">
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
                <button type="button" onClick={save} disabled={disabled} className="flex items-center gap-1.5 rounded-lg bg-accent-solid px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-40">
                  <Download className="size-4" />{t.tool.download}
                </button>
              </div>
            </div>

            <SuggestedActions actions={suggestions} disabled={disabled} />

            <div className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 [container-type:size] ${preview === 'checker' ? 'checker' : ''}`} style={preview === 'checker' ? undefined : { background: preview }}>
              {current && (compare && before ? <CompareView key={active.id + active.history.length} before={before} after={current} /> : <PreviewCanvas key={active.id + active.history.length} bitmap={current} label={t.preview(active.name)} />)}
              {!busy && items.length < MAX_IMAGES && (
                <Tooltip label={t.queue.addHint} placement="top">
                  <button type="button" onClick={() => addInput.current?.click()} aria-label={t.queue.addHint}
                    className="absolute bottom-5 left-1/2 grid size-12 -translate-x-1/2 place-items-center rounded-full bg-accent-solid text-on-accent shadow-lg shadow-black/25 transition hover:scale-105 active:scale-95">
                    <Plus className="size-6" />
                  </button>
                </Tooltip>
              )}
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

            <footer className="flex shrink-0 items-center justify-between gap-4 overflow-x-auto border-t border-line px-4 py-1.5 font-mono text-[10px] text-dim">
              <span className="shrink-0">{current!.width} × {current!.height} PX{transparent ? ` · ${t.footer.alpha}` : ''} · {t.footer.step(active.history.length)}</span>
              {error ? <span role="alert" className="shrink-0 text-danger">{error}</span> : <span className="shrink-0">{t.footer.limit}</span>}
            </footer>
          </>
        )}
      </main>

      {cropSrc && <CropDialog src={cropSrc} onCancel={() => setCropSrc(null)} onApply={applyCrop} />}
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
