import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Images, X } from 'lucide-react'
import { compressImage, formatFileSize } from '../utils/photo'

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  max?: number
  label?: string
  hint?: string
  error?: string | null
}

// Escolher/tirar fotos: um botão abre a câmera traseira (celular) e outro a galeria.
// As fotos são reduzidas aqui mesmo e aparecem como miniaturas, com opção de remover.
export function PhotoPicker({ files, onChange, max = 3, label = 'Fotos do alimento', hint, error }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  // Miniaturas: o endereço temporário é criado junto com a lista e liberado quando ela muda.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  async function handle(list: FileList | null) {
    if (!list || list.length === 0) return
    setLocalError(null)
    const picked = Array.from(list)
    if (files.length + picked.length > max) {
      setLocalError(`No máximo ${max} fotos.`)
    }
    const room = picked.slice(0, Math.max(0, max - files.length))
    setBusy(true)
    try {
      const compressed = await Promise.all(room.map(compressImage))
      onChange([...files, ...compressed])
    } finally {
      setBusy(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  const full = files.length >= max

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">
        {label} <span className="font-normal text-slate-400">({files.length}/{max})</span>
      </p>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}

      {files.length > 0 && (
        <ul className="mb-2 grid grid-cols-3 gap-2">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200">
              {previews[index] && <img src={previews[index]} alt={`Foto ${index + 1} selecionada`} className="aspect-square w-full object-cover" />}
              <span className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{formatFileSize(file.size)}</span>
              <button
                type="button"
                aria-label={`Remover foto ${index + 1}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={full || busy}
          onClick={() => cameraRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Camera size={16} aria-hidden="true" /> Tirar foto
        </button>
        <button
          type="button"
          disabled={full || busy}
          onClick={() => galleryRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Images size={16} aria-hidden="true" /> Escolher da galeria
        </button>
        {busy && <span className="self-center text-xs text-slate-500">Preparando...</span>}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Tirar foto com a câmera" tabIndex={-1} onChange={(e) => handle(e.target.files)} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" aria-label="Escolher fotos da galeria" tabIndex={-1} onChange={(e) => handle(e.target.files)} />

      {(error || localError) && <p className="mt-1 text-xs text-red-600">{error ?? localError}</p>}
    </div>
  )
}
