import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DonationsPage } from '../src/pages/donations/DonationsPage'

const useDonationsPage = vi.hoisted(() => vi.fn())
vi.mock('../src/hooks/useDonations', () => ({ useDonationsPage }))
vi.mock('../src/services/auth', () => ({ getStoredUser: () => ({ id: 'u', role: 'ADMIN' }) }))
vi.mock('../src/pages/donations/DonationFormModal', () => ({ DonationFormModal: () => null }))

const donation = (n: number) => ({
  id: `d${n}`, number: n, description: `Doação ${n}`, category: 'PADARIA', donor: { name: 'Padaria' }, recipient: null,
  estimatedQuantityKg: '10', pickupWindowStart: '2026-11-10T10:00:00Z', status: 'DISPONIVEL', urgency: null,
})
const page = (over: Record<string, unknown> = {}) => ({
  data: { data: [donation(1), donation(2)], meta: { total: 45, page: 1, limit: 20, totalPages: 3, hasNext: true, hasPrev: false, ...over } },
  isLoading: false, isError: false,
})

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><DonationsPage /></MemoryRouter>)
const lastParams = () => useDonationsPage.mock.calls.at(-1)![0]

describe('DonationsPage (busca, filtros e páginas)', () => {
  beforeEach(() => { vi.clearAllMocks(); useDonationsPage.mockReturnValue(page()) })

  it('mostra o código da doação em cada linha e o total', () => {
    renderAt('/doacoes')
    expect(screen.getByText('DOA-00001')).toBeInTheDocument()
    expect(screen.getByText('DOA-00002')).toBeInTheDocument()
    expect(screen.getByText('1–20 de 45 doação(ões)')).toBeInTheDocument()
  })

  it('os filtros vêm da URL (atalhos da central de pendências)', () => {
    renderAt('/doacoes?status=DISPONIVEL&sort=prazo&q=pães&page=2')
    expect(lastParams()).toMatchObject({ status: 'DISPONIVEL', sort: 'prazo', q: 'pães', page: 2, limit: 20 })
    expect(screen.getByLabelText('Status')).toHaveValue('DISPONIVEL')
    expect(screen.getByLabelText('Ordem')).toHaveValue('prazo')
    expect(screen.getByLabelText('Buscar')).toHaveValue('pães')
  })

  it('escolher um status filtra e volta para a primeira página', async () => {
    const user = userEvent.setup()
    renderAt('/doacoes?page=3')
    await user.selectOptions(screen.getByLabelText('Status'), 'RESERVADA')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'RESERVADA', page: 1 }))
  })

  it('a busca só consulta depois de uma pausa na digitação', async () => {
    const user = userEvent.setup()
    renderAt('/doacoes')
    await user.type(screen.getByLabelText('Buscar'), 'doa42')
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'doa42' }))
  })

  it('paginação: avança, e "Anterior" fica desabilitado na primeira página', async () => {
    const user = userEvent.setup()
    renderAt('/doacoes')
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled()
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /próxima/i }))
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }))
  })

  it('"Limpar filtros" remove tudo', async () => {
    const user = userEvent.setup()
    renderAt('/doacoes?status=DISPONIVEL&q=pães')
    await user.click(screen.getByRole('button', { name: /limpar filtros/i }))
    await waitFor(() => expect(lastParams()).toMatchObject({ status: undefined, q: undefined }))
    expect(screen.queryByRole('button', { name: /limpar filtros/i })).not.toBeInTheDocument()
  })

  it('sem resultado, explica que são os filtros', () => {
    useDonationsPage.mockReturnValue({ data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false } }, isLoading: false, isError: false })
    renderAt('/doacoes?q=zzz')
    expect(screen.getByText('Nenhuma doação com esses filtros.')).toBeInTheDocument()
  })
})
