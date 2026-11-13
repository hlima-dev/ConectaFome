import { useState } from 'react'
import { Camera } from 'lucide-react'
import { PhotoGallery } from './PhotoGallery'
import { PhotoPicker } from './PhotoPicker'
import { Modal } from './Modal'
import { usePhotos, useUploadPhotos } from '../hooks/usePhotos'
import { getErrorMessage } from '../utils/errors'
import { useAppConfig } from '../hooks/useAppConfig'

interface Props {
  donationId: string
  // O que a pessoa pode acrescentar nesta doação, conforme papel e etapa.
  canAddOffer: boolean
  canAddDelivery: boolean
}

// Seção "Fotos" da doação: galeria por etapa + envio de foto da oferta (doador) ou
// da entrega (receptor).
export function DonationPhotos({ donationId, canAddOffer, canAddDelivery }: Props) {
  const config = useAppConfig()
  const { data: photos, isLoading } = usePhotos(donationId)
  const upload = useUploadPhotos(donationId)
  const [adding, setAdding] = useState<'OFERTA' | 'ENTREGA' | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!config.photos.enabled) return null

  const offerCount = photos?.filter((p) => p.kind === 'OFERTA').length ?? 0
  const deliveryCount = photos?.filter((p) => p.kind === 'ENTREGA').length ?? 0

  async function send() {
    if (!adding || files.length === 0) {
      setError('Escolha ao menos uma foto')
      return
    }
    setError(null)
    try {
      await upload.mutateAsync({ files, kind: adding })
      setAdding(null)
      setFiles([])
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <section className="mt-8" aria-labelledby="fotos-titulo">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="fotos-titulo" className="text-lg font-semibold text-slate-900">Fotos</h2>
        <div className="flex gap-2">
          {canAddOffer && offerCount < 3 && (
            <button type="button" onClick={() => setAdding('OFERTA')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
              <Camera size={16} aria-hidden="true" /> Adicionar foto do alimento
            </button>
          )}
          {canAddDelivery && deliveryCount < 3 && (
            <button type="button" onClick={() => setAdding('ENTREGA')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
              <Camera size={16} aria-hidden="true" /> Adicionar foto do recebimento
            </button>
          )}
        </div>
      </div>

      {canAddOffer && !isLoading && offerCount === 0 && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Esta doação ainda não tem foto. Sem ela, os receptores não conseguem reservar.
        </p>
      )}

      {isLoading ? <p className="text-sm text-slate-500">Carregando fotos...</p> : <PhotoGallery donationId={donationId} photos={photos ?? []} />}

      {adding && (
        <Modal title={adding === 'OFERTA' ? 'Foto do alimento' : 'Foto do recebimento'} onClose={() => { setAdding(null); setFiles([]); setError(null) }}>
          <PhotoPicker
            files={files}
            onChange={setFiles}
            max={3 - (adding === 'OFERTA' ? offerCount : deliveryCount)}
            label={adding === 'OFERTA' ? 'Fotos do alimento' : 'Fotos do que foi recebido'}
            hint="Fotografe só o alimento e a embalagem, sem pessoas."
            error={error}
          />
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => { setAdding(null); setFiles([]); setError(null) }}>Cancelar</button>
            <button type="button" disabled={upload.isPending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" onClick={send}>
              {upload.isPending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
