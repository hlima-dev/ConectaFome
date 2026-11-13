import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PendingPanel } from '../src/components/PendingPanel'

const usePending = vi.hoisted(() => vi.fn())
const mutate = vi.hoisted(() => vi.fn())
const maintenance = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, data: undefined as unknown }))
vi.mock('../src/hooks/useReports', () => ({ usePending, useRunMaintenance: () => maintenance }))

const empty = { count: 0, items: [] }
const report = (over: Record<string, unknown> = {}) => ({
  generatedAt: '2026-11-10T12:00:00Z', total: 0,
  approvals: empty, urgentAvailable: empty, reservedWithoutRoute: empty, awaitingConfirmation: empty, overdueScheduled: empty, withoutPhoto: empty, routesToday: empty,
  ...over,
})

const renderPanel = () => render(<MemoryRouter><PendingPanel /></MemoryRouter>)

describe('PendingPanel (central de pendências)', () => {
  beforeEach(() => { vi.clearAllMocks(); maintenance.data = undefined; maintenance.mutate = mutate })

  it('sem pendências, diz que está tudo em dia', () => {
    usePending.mockReturnValue({ data: report(), isLoading: false })
    renderPanel()
    expect(screen.getByText(/Tudo em dia/)).toBeInTheDocument()
  })

  it('mostra só os grupos com algo a fazer, com contagem e atalho', () => {
    usePending.mockReturnValue({
      isLoading: false,
      data: report({
        total: 3,
        urgentAvailable: { count: 2, items: [{ id: 'd1', code: 'DOA-00007', description: 'Pães', donorName: 'Padaria', hoursLeft: 5 }] },
        approvals: { count: 1, items: [{ kind: 'recipient', id: 'r1', name: 'ONG Nova', waitingHours: 30 }] },
      }),
    })
    renderPanel()

    expect(screen.getByRole('region', { name: 'Urgentes sem reserva' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cadastros aguardando aprovação' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Coletadas sem confirmação' })).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: /DOA-00007 · Pães/ })).toHaveAttribute('href', '/doacoes/d1')
    expect(screen.getByRole('link', { name: 'Ver disponíveis por prazo' })).toHaveAttribute('href', '/doacoes?status=DISPONIVEL&sort=prazo')
    expect(screen.getByText(/há 30 h/)).toBeInTheDocument()
  })

  it('o botão de verificação roda a manutenção e mostra o resultado', async () => {
    usePending.mockReturnValue({ data: report(), isLoading: false })
    const user = userEvent.setup()
    const { unmount } = renderPanel()
    await user.click(screen.getByRole('button', { name: /verificar prazos agora/i }))
    expect(mutate).toHaveBeenCalledTimes(1)
    unmount()

    maintenance.data = { ranAt: 'x', expired: 2, released: 1 }
    renderPanel()
    expect(screen.getByText(/2 doação\(ões\) marcada\(s\) como vencida\(s\) e 1 reserva\(s\)/)).toBeInTheDocument()
  })
})
