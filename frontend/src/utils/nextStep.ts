import { PICKUP_FAILURE_LABELS, type Donation } from '../types/donations'

export type StepViewer = 'admin' | 'donor' | 'recipient'

export interface NextStep {
  tone: 'action' | 'waiting' | 'done'
  text: string
}

// "E agora?": diz a quem está olhando a doação o que fazer, ou o que se espera de
// outra pessoa, conforme o papel e o estado atual.
export function getNextStep(donation: Pick<Donation, 'status' | 'route' | 'recipient' | 'pickupWindowEnd' | 'pickupFailureReason'>, viewer: StepViewer): NextStep | null {
  const recipient = donation.recipient?.name ?? 'o receptor'
  const route = donation.route ? `rota #${donation.route.routeNumber}` : 'uma rota'
  const until = new Date(donation.pickupWindowEnd).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  switch (donation.status) {
    case 'DISPONIVEL':
      if (viewer === 'admin') return { tone: 'waiting', text: 'Disponível: aguarde um receptor reservar ou use "Casar com receptor". Se for urgente, vale casar direto.' }
      return { tone: 'waiting', text: 'Aguardando um receptor reservar. Você é avisado assim que acontecer.' }
    case 'RESERVADA': {
      const failed = donation.pickupFailureReason ? ` A última tentativa de coleta não deu certo (${PICKUP_FAILURE_LABELS[donation.pickupFailureReason]}).` : ''
      if (viewer === 'admin') return { tone: 'action', text: `Reservada para ${recipient}: inclua em ${route === 'uma rota' ? 'uma rota de coleta' : route}.${failed}` }
      if (viewer === 'donor') return { tone: 'waiting', text: `Reservada para ${recipient}. Deixe o alimento pronto para retirada até ${until}.${failed}` }
      return { tone: 'waiting', text: `Você reservou. A administração vai incluir em uma rota de coleta. Se não puder buscar, libere a reserva abaixo.${failed}` }
    }
    case 'AGENDADA':
      if (viewer === 'admin') return { tone: 'waiting', text: `Agendada na ${route}: acompanhe pela tela da rota. Quem coleta pode registrar pelo link do voluntário.` }
      if (viewer === 'donor') return { tone: 'waiting', text: `O voluntário vai buscar na ${route}, dentro da janela até ${until}.` }
      return { tone: 'waiting', text: `Em ${route}. Você será avisado quando for coletada.` }
    case 'COLETADA':
      if (viewer === 'recipient') return { tone: 'action', text: 'Coletada. Quando o alimento chegar, confirme o recebimento (e, se quiser, envie uma foto).' }
      if (viewer === 'donor') return { tone: 'waiting', text: 'Coletada. Aguardando o receptor confirmar o recebimento. Você já pode emitir o comprovante.' }
      return { tone: 'waiting', text: `Coletada. Aguardando ${recipient} confirmar o recebimento.` }
    case 'ENTREGUE':
      return { tone: 'done', text: viewer === 'donor' || viewer === 'admin' ? 'Concluída: recebimento confirmado. O comprovante está disponível.' : 'Concluída: recebimento confirmado. Obrigado!' }
    case 'CANCELADA':
      return { tone: 'done', text: 'Esta doação foi cancelada. Não há mais nada a fazer.' }
    case 'VENCIDA':
      return { tone: 'done', text: 'O prazo desta doação passou sem coleta. Não há mais nada a fazer.' }
    default:
      return null
  }
}
