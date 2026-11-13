import { DonationStatus, RecipientType } from '@prisma/client'
import { prisma } from '../config/prisma'
import { AppError } from '../utils/AppError'
import { donationCode, isValidReceiptSignature, parseDonationCode } from '../utils/donationCode'

// Mesma resposta (404) para código inexistente, assinatura errada ou doação ainda
// não coletada: quem escaneia um QR falso não descobre nada.
const notFound = () => new AppError('Comprovante não encontrado ou inválido.', 404)

// Conferência pública do comprovante (o QR code leva aqui). Devolve o mínimo
// necessário para confirmar que o documento é verdadeiro: sem endereços, sem
// documentos (CPF/CNPJ), e sem o nome de famílias atendidas.
export class ReceiptVerificationService {
  async verify(code: string, signature: string) {
    if (!/^DOA-\d{5,9}$/i.test(code)) throw notFound()
    const normalized = code.toUpperCase()
    if (!isValidReceiptSignature(normalized, signature)) throw notFound()

    const number = parseDonationCode(normalized)
    if (number === null) throw notFound()

    const donation = await prisma.donation.findUnique({
      where: { number },
      include: { donor: { select: { name: true } }, recipient: { select: { name: true, type: true } } },
    })
    const issuable: DonationStatus[] = [DonationStatus.COLETADA, DonationStatus.ENTREGUE]
    if (!donation || !issuable.includes(donation.status)) throw notFound()

    return {
      valid: true,
      code: donationCode(donation.number),
      description: donation.description,
      status: donation.status,
      collectedQuantityKg: donation.collectedQuantityKg === null ? null : Number(donation.collectedQuantityKg),
      collectedAt: donation.collectedAt,
      confirmedAt: donation.confirmedAt,
      donorName: donation.donor.name,
      recipientName: donation.recipient ? (donation.recipient.type === RecipientType.FAMILIA ? 'Família atendida' : donation.recipient.name) : null,
    }
  }
}
