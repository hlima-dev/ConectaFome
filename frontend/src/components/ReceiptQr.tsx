import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// QR code do comprovante: leva à página pública que confere se ele é autêntico.
export function ReceiptQr({ code, signature }: { code: string; signature: string }) {
  const url = `${window.location.origin}/verificar/${code}/${signature}`
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 160, errorCorrectionLevel: 'M' })
      .then((data) => {
        if (!cancelled) setImage(data)
      })
      .catch(() => {
        if (!cancelled) setImage(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex items-center gap-4">
      {image ? (
        <img src={image} alt={`QR code para conferir o comprovante ${code}`} width={96} height={96} className="shrink-0" />
      ) : (
        <div className="h-24 w-24 shrink-0 rounded bg-slate-100" aria-hidden="true" />
      )}
      <p className="text-xs text-slate-600">
        Para conferir se este comprovante é autêntico, aponte a câmera do celular para o QR code ou abra<br />
        <span className="break-all font-mono text-[11px] text-slate-700">{url}</span>
      </p>
    </div>
  )
}
