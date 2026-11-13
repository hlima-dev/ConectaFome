import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DonationTimeline } from '../src/pages/donations/DonationTimeline'
import type { DonationEvent } from '../src/types/donations'

const events: DonationEvent[] = [
  {
    id: 'e1',
    action: 'CRIADA',
    fromStatus: null,
    toStatus: 'DISPONIVEL',
    createdAt: '2026-10-01T12:00:00Z',
    actor: { id: 'u1', name: 'Mercado Bom Preço', role: 'DOADOR' },
  },
  {
    id: 'e2',
    action: 'CASADA',
    fromStatus: 'DISPONIVEL',
    toStatus: 'RESERVADA',
    createdAt: '2026-10-01T13:00:00Z',
    actor: { id: 'u2', name: 'Administrador', role: 'ADMIN' },
  },
  { id: 'e3', action: 'VENCIDA', fromStatus: 'RESERVADA', toStatus: 'VENCIDA', createdAt: '2026-10-02T13:00:00Z', actor: null },
]

describe('DonationTimeline', () => {
  it('mostra cada passo com o usuário e o papel, na ordem recebida', () => {
    render(<DonationTimeline events={events} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('Doação registrada')).toBeInTheDocument()
    expect(within(items[0]).getByText(/Mercado Bom Preço \(Doador\)/)).toBeInTheDocument()
    expect(within(items[1]).getByText('Atribuída a um receptor pela administração')).toBeInTheDocument()
    expect(within(items[1]).getByText(/Administrador \(Administração\)/)).toBeInTheDocument()
  })

  it('indica quando um passo não tem usuário registrado', () => {
    render(<DonationTimeline events={events} />)
    expect(screen.getByText(/Sistema \(automático\)/)).toBeInTheDocument()
  })

  it('explica quando a doação não tem histórico', () => {
    render(<DonationTimeline events={[]} />)
    expect(screen.getByText(/nenhum registro no histórico/i)).toBeInTheDocument()
  })
})
