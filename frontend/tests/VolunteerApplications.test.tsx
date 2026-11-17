import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { VolunteerApplications } from '../src/components/VolunteerApplications'

const useApplications = vi.hoisted(() => vi.fn())
const approve = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }))
const reject = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }))
vi.mock('../src/hooks/useVolunteerApplications', () => ({
  useVolunteerApplications: useApplications,
  useApproveApplication: () => approve,
  useRejectApplication: () => reject,
}))

const app = (over: Record<string, unknown> = {}) => ({
  id: 'a1', name: 'Carlos Andrade', phone: '15999991111', email: 'carlos@email.com', city: 'Sorocaba',
  availability: ['FIM_DE_SEMANA', 'SEMANA_NOITE'], hasVehicle: true, message: 'Tenho uma Fiorino', status: 'PENDENTE',
  reviewNote: null, reviewedAt: null, createdAt: '2026-11-10T12:00:00Z', volunteer: null, ...over,
})

const renderList = () => render(<MemoryRouter><VolunteerApplications /></MemoryRouter>)

describe('VolunteerApplications (análise das inscrições)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useApplications.mockReturnValue({ data: [app()], isLoading: false })
    approve.mutateAsync.mockResolvedValue({})
    reject.mutateAsync.mockResolvedValue({})
  })

  it('abre em "aguardando análise" e mostra os dados para decidir', () => {
    renderList()
    expect(useApplications).toHaveBeenLastCalledWith('PENDENTE')
    expect(screen.getByText('Carlos Andrade')).toBeInTheDocument()
    expect(screen.getByText('(15) 99999-1111')).toBeInTheDocument()
    expect(screen.getByText('carlos@email.com')).toBeInTheDocument()
    expect(screen.getByText('Fins de semana · Noite, em dias úteis')).toBeInTheDocument()
    expect(screen.getByText('Tem veículo')).toBeInTheDocument()
    expect(screen.getByText(/Tenho uma Fiorino/)).toBeInTheDocument()
  })

  it('o botão WhatsApp abre a conversa com a pessoa (telefone com código do Brasil e mensagem pronta)', () => {
    renderList()
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5515999991111\?text=/)
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('Olá, Carlos!')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('aprovar pede o CPF, valida e só então chama o servidor; depois diz qual é o próximo passo', async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: /aprovar/i }))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('CPF do voluntário'), '111.111.111-11')
    await user.click(within(dialog).getByRole('button', { name: /aprovar e cadastrar/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Informe um CPF válido')
    expect(approve.mutateAsync).not.toHaveBeenCalled()

    await user.clear(within(dialog).getByLabelText('CPF do voluntário'))
    await user.type(within(dialog).getByLabelText('CPF do voluntário'), '52998224725')
    expect(within(dialog).getByLabelText('CPF do voluntário')).toHaveValue('529.982.247-25')
    await user.click(within(dialog).getByRole('button', { name: /aprovar e cadastrar/i }))

    expect(approve.mutateAsync).toHaveBeenCalledWith({ id: 'a1', document: '529.982.247-25' })
    expect(await screen.findByText(/foi aprovado\(a\) e já aparece em Voluntários/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para as rotas' })).toHaveAttribute('href', '/rotas')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra o erro do servidor ao aprovar (ex.: CPF já cadastrado) e mantém a janela aberta', async () => {
    approve.mutateAsync.mockRejectedValue({ isAxiosError: true, response: { data: { message: 'Já existe um voluntário com este CPF (Maria).' } } })
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: /aprovar/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('CPF do voluntário'), '52998224725')
    await user.click(within(dialog).getByRole('button', { name: /aprovar e cadastrar/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um voluntário com este CPF')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('recusar envia o motivo (que fica só para a administração)', async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('button', { name: /recusar/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/a pessoa recebe uma mensagem neutra/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Motivo/), 'fora da região')
    await user.click(within(dialog).getByRole('button', { name: /recusar inscrição/i }))

    expect(reject.mutateAsync).toHaveBeenCalledWith({ id: 'a1', note: 'fora da região' })
  })

  it('inscrições já analisadas não têm botões de decisão e mostram o resultado', () => {
    useApplications.mockReturnValue({
      data: [
        app({ id: 'a2', name: 'Maria', status: 'APROVADA', volunteer: { id: 'v1', name: 'Maria', active: true } }),
        app({ id: 'a3', name: 'João', status: 'RECUSADA', reviewNote: 'fora da região' }),
      ],
      isLoading: false,
    })
    renderList()
    expect(screen.queryByRole('button', { name: /aprovar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /recusar/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Cadastrado como voluntário: Maria/)).toBeInTheDocument()
    expect(screen.getByText(/Motivo: fora da região/)).toBeInTheDocument()
  })

  it('o filtro troca a consulta, e "Todas" não filtra por status', async () => {
    const user = userEvent.setup()
    renderList()
    await user.selectOptions(screen.getByLabelText('Mostrar'), 'APROVADA')
    expect(useApplications).toHaveBeenLastCalledWith('APROVADA')
    await user.selectOptions(screen.getByLabelText('Mostrar'), '')
    expect(useApplications).toHaveBeenLastCalledWith(undefined)
  })

  it('sem inscrições pendentes, explica onde as novas aparecem', () => {
    useApplications.mockReturnValue({ data: [], isLoading: false })
    renderList()
    expect(screen.getByText(/Nenhuma inscrição aguardando análise/)).toBeInTheDocument()
  })
})
