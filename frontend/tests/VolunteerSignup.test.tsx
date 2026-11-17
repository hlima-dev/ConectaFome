import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VolunteerSignup } from '../src/components/VolunteerSignup'

const apply = vi.hoisted(() => vi.fn())
vi.mock('../src/services/volunteerApplications', () => ({ applyAsVolunteer: apply }))

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome completo'), 'Carlos Andrade')
  await user.type(screen.getByLabelText('WhatsApp (com DDD)'), '15999991111')
  await user.type(screen.getByLabelText('Cidade'), 'Sorocaba')
  await user.click(screen.getByText('Fins de semana'))
  await user.click(screen.getByLabelText(/Concordo em ser contatado/))
}

describe('VolunteerSignup (formulário da página inicial)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apply.mockResolvedValue('Inscrição recebida')
  })

  it('explica o caminho: inscrição, link da rota sem conta, coleta com foto', () => {
    render(<VolunteerSignup />)
    expect(screen.getByRole('heading', { name: /quer ajudar a levar comida/i })).toBeInTheDocument()
    expect(screen.getByText(/sem criar conta nem senha/)).toBeInTheDocument()
  })

  it('não envia vazio e mostra o que falta, sem chamar o servidor', async () => {
    const user = userEvent.setup()
    render(<VolunteerSignup />)
    await user.click(screen.getByRole('button', { name: /quero ser voluntário/i }))

    expect(screen.getByText('Informe o seu nome')).toBeInTheDocument()
    expect(screen.getByText('Informe o WhatsApp com DDD')).toBeInTheDocument()
    expect(screen.getByText('Informe a sua cidade')).toBeInTheDocument()
    expect(screen.getByText('Escolha ao menos um horário')).toBeInTheDocument()
    expect(screen.getByText(/É preciso concordar/)).toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it('aplica a máscara no telefone enquanto digita', async () => {
    const user = userEvent.setup()
    render(<VolunteerSignup />)
    await user.type(screen.getByLabelText('WhatsApp (com DDD)'), '15999991111')
    expect(screen.getByLabelText('WhatsApp (com DDD)')).toHaveValue('(15) 99999-1111')
  })

  it('e-mail é opcional, mas se vier precisa ser válido', async () => {
    const user = userEvent.setup()
    render(<VolunteerSignup />)
    await fillValid(user)
    await user.type(screen.getByLabelText(/E-mail/), 'isto-nao-e-email')
    await user.click(screen.getByRole('button', { name: /quero ser voluntário/i }))
    expect(screen.getByText('E-mail inválido')).toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it('envia os dados, sem CPF, e mostra a confirmação', async () => {
    const user = userEvent.setup()
    render(<VolunteerSignup />)
    await fillValid(user)
    await user.click(screen.getByLabelText(/Tenho veículo/))
    await user.type(screen.getByLabelText(/Quer contar algo/), 'Tenho uma Fiorino')
    await user.click(screen.getByRole('button', { name: /quero ser voluntário/i }))

    expect(apply).toHaveBeenCalledTimes(1)
    const sent = apply.mock.calls[0][0]
    expect(sent).toMatchObject({ name: 'Carlos Andrade', phone: '(15) 99999-1111', city: 'Sorocaba', availability: ['FIM_DE_SEMANA'], hasVehicle: true, message: 'Tenho uma Fiorino', consent: true, website: '' })
    expect(sent.email).toBeUndefined()
    expect(sent).not.toHaveProperty('document')
    expect(await screen.findByText('Inscrição recebida!')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /quero ser voluntário/i })).not.toBeInTheDocument()
  })

  it('permite marcar vários horários e desmarcar', async () => {
    const user = userEvent.setup()
    render(<VolunteerSignup />)
    await fillValid(user)
    await user.click(screen.getByText('Tarde, em dias úteis'))
    await user.click(screen.getByText('Fins de semana')) // desmarca
    await user.click(screen.getByRole('button', { name: /quero ser voluntário/i }))
    expect(apply.mock.calls[0][0].availability).toEqual(['SEMANA_TARDE'])
  })

  it('o campo-isca existe, está escondido de quem usa teclado e leitor de tela e vai vazio', () => {
    render(<VolunteerSignup />)
    const decoy = document.getElementById('vol-website') as HTMLInputElement
    expect(decoy).toBeInTheDocument()
    expect(decoy.tabIndex).toBe(-1)
    expect(decoy.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('erro do servidor (ex.: já inscrito) aparece sem perder o que foi digitado', async () => {
    apply.mockRejectedValue({ isAxiosError: true, response: { data: { message: 'Já recebemos a sua inscrição. A equipe entra em contato assim que analisar.' } } })
    const user = userEvent.setup()
    render(<VolunteerSignup />)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /quero ser voluntário/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Já recebemos a sua inscrição')
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Carlos Andrade')
  })
})
