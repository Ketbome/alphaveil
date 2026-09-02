import { useRef, useState, type DragEvent } from 'react'
import { ArrowUpRight, ImagePlus } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  onFiles: (files: File[]) => void
}

export function Dropzone({ onFiles }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const pick = (files: FileList | null) => {
    if (files?.length) onFiles(Array.from(files))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    pick(e.dataTransfer.files)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`dropzone-frame group relative flex min-h-72 w-full flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition active:translate-y-px sm:min-h-96 sm:p-7
          ${over ? 'border-accent bg-accent/8' : 'border-line bg-panel/55 hover:border-dim hover:bg-panel/75'}`}
      >
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          <span>{t.drop.input}</span>
          <span>{t.drop.localOnly}</span>
        </div>
        <div className="relative mx-auto flex max-w-sm flex-col items-center text-center">
          <span className="mb-5 grid size-14 place-items-center rounded-2xl border border-accent/25 bg-accent/8 text-accent transition group-hover:-translate-y-1">
            <ImagePlus className="size-6" />
          </span>
          <div className="text-xl font-semibold tracking-tight sm:text-2xl">{t.drop.title}</div>
          <div className="mt-2 text-sm text-muted">{t.drop.subtitle}</div>
        </div>
        <div className="flex items-center justify-between border-t border-line/80 pt-4">
          <span className="font-mono text-[10px] text-dim">{t.drop.formats}</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">{t.drop.choose} <ArrowUpRight className="size-3.5" /></span>
        </div>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
    </>
  )
}
