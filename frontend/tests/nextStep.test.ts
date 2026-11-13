import { describe, expect, it } from 'vitest'
import { getNextStep } from '../src/utils/nextStep'

const base = { route: null, recipient: { id: 'r', name: 'ONG Mesa' }, pickupWindowEnd: '2026-11-10T18:00:00Z', pickupFailureReason: null } as const

describe('próximo passo da doação', () => {
  it('o receptor só tem "ação" quando precisa confirmar o recebimento', () => {
    expect(getNextStep({ ...base, status: 'COLETADA' }, 'recipient')).toMatchObject({ tone: 'action', text: expect.stringContaining('confirme o recebimento') })
    expect(getNextStep({ ...base, status: 'RESERVADA' }, 'recipient')?.tone).toBe('waiting')
    expect(getNextStep({ ...base, status: 'AGENDADA' }, 'recipient')?.tone).toBe('waiting')
  })

  it('a administração é chamada a agir quando a doação está reservada e sem rota', () => {
    const step = getNextStep({ ...base, status: 'RESERVADA' }, 'admin')
    expect(step?.tone).toBe('action')
    expect(step?.text).toContain('ONG Mesa')
    expect(step?.text).toContain('rota de coleta')
  })

  it('cita a rota quando já agendada', () => {
    const step = getNextStep({ ...base, status: 'AGENDADA', route: { id: 'x', routeNumber: 7 } }, 'donor')
    expect(step?.text).toContain('rota #7')
  })

  it('lembra a última coleta que falhou ao reservar de novo', () => {
    const step = getNextStep({ ...base, status: 'RESERVADA', pickupFailureReason: 'DOADOR_AUSENTE' }, 'admin')
    expect(step?.text).toContain('Doador ausente')
  })

  it('doador sabe que pode emitir o comprovante depois da coleta', () => {
    expect(getNextStep({ ...base, status: 'COLETADA' }, 'donor')?.text).toContain('comprovante')
  })

  it('estados finais não pedem nada a ninguém', () => {
    for (const status of ['ENTREGUE', 'CANCELADA', 'VENCIDA'] as const) {
      expect(getNextStep({ ...base, status }, 'admin')?.tone).toBe('done')
    }
  })
})
