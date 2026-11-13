import { useState } from 'react'
import { X } from 'lucide-react'
import { PHOTO_KIND_LABELS, photoUrl, type DonationPhoto, type PhotoKind } from '../services/photos'

const ORDER: PhotoKind[] = ['OFERTA', 'COLETA', 'ENTREGA']

const when = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Fotos da doação, agrupadas por etapa, com ampliação ao clicar.
export function PhotoGallery({ donationId, photos }: { donationId: string; photos: DonationPhoto[] }) {
  const [open, setOpen] = useState<DonationPhoto | null>(null)

  if (photos.length === 0) return <p className="text-sm text-slate-500">Nenhuma foto registrada ainda.</p>

  return (
    <div className="flex flex-col gap-5">
      {ORDER.map((kind) => {
        const group = photos.filter((p) => p.kind === kind)
        if (group.length === 0) return null
        return (
          <section key={kind} aria-label={PHOTO_KIND_LABELS[kind]}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{PHOTO_KIND_LABELS[kind]}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {group.map((photo) => (
                <li key={photo.id}>
                  <button type="button" onClick={() => setOpen(photo)} className="group block w-full overflow-hidden rounded-xl border border-slate-200 text-left">
                    <img src={photoUrl(donationId, photo.id)} alt={`${PHOTO_KIND_LABELS[photo.kind]}, ${when(photo.createdAt)}`} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105" />
                    <span className="block px-2 py-1 text-xs text-slate-500">
                      {when(photo.createdAt)}
                      {photo.uploadedByLabel ? ` · ${photo.uploadedByLabel}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setOpen(null)}>
          <button type="button" aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setOpen(null)}>
            <X size={22} />
          </button>
          <img src={photoUrl(donationId, open.id)} alt={PHOTO_KIND_LABELS[open.kind]} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
