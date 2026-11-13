import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Register } from '../src/pages/Register'

const registerMock = vi.hoisted(() => vi.fn())
const saveSessionMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/auth', () => ({ register: registerMock, saveSession: saveSessionMock }))

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  )
}

describe('Register', () => {
  it('mostra os campos de doador por padrão (papel inicial)', () => {
    renderRegister()
    expect(screen.getByText('Dados do doador')).toBeInTheDocument()
    expect(screen.queryByText('Dados do receptor')).not.toBeInTheDocument()
  })

  it('troca pros campos de receptor ao selecionar esse papel', async () => {
    const user = userEvent.setup()
    renderRegister()

    await user.click(screen.getByText('Receptor (ONG, família)'))

    expect(screen.getByText('Dados do receptor')).toBeInTheDocument()
    expect(screen.queryByText('Dados do doador')).not.toBeInTheDocument()
  })

  it('exige o nome do doador antes de submeter', async () => {
    const user = userEvent.setup()
    renderRegister()

    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    expect(await screen.findByText('Nome do doador é obrigatório')).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })
})

describe('Register — endereço (usado para o mapa das rotas)', () => {
  it('doador: envia o endereço junto com cidade e UF', async () => {
    const user = userEvent.setup()
    registerMock.mockResolvedValueOnce({ csrfToken: 'c', user: { id: '1', name: 'x', email: 'x@x.com', role: 'DOADOR' } })
    renderRegister()

    await user.type(screen.getByLabelText('Nome'), 'Maria')
    await user.type(screen.getByLabelText('E-mail'), 'maria@mercado.com')
    await user.type(screen.getByLabelText('Senha'), 'Senha1234')
    await user.type(screen.getByLabelText('Nome do estabelecimento'), 'Mercado Bom Preço')
    await user.type(screen.getByLabelText(/^CPF ou CNPJ/), '11222333000181')
    await user.type(screen.getByLabelText(/^Endereço/), 'Rua XV de Novembro, 100')
    await user.type(screen.getByLabelText('Cidade'), 'Sorocaba')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    await vi.waitFor(() => expect(registerMock).toHaveBeenCalled())
    expect(registerMock.mock.calls.at(-1)![0].donor).toMatchObject({ address: 'Rua XV de Novembro, 100', city: 'Sorocaba' })
  })

  it('receptor: também pede o endereço', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.click(screen.getByText('Receptor (ONG, família)'))
    expect(screen.getByLabelText(/^Endereço/)).toBeInTheDocument()
  })

  it('o endereço é opcional (cadastro segue sem ele)', async () => {
    const user = userEvent.setup()
    registerMock.mockResolvedValueOnce({ csrfToken: 'c', user: { id: '1', name: 'x', email: 'x@x.com', role: 'DOADOR' } })
    renderRegister()
    await user.type(screen.getByLabelText('Nome'), 'Maria')
    await user.type(screen.getByLabelText('E-mail'), 'maria@mercado.com')
    await user.type(screen.getByLabelText('Senha'), 'Senha1234')
    await user.type(screen.getByLabelText('Nome do estabelecimento'), 'Mercado')
    await user.type(screen.getByLabelText(/^CPF ou CNPJ/), '11222333000181')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))
    await vi.waitFor(() => expect(registerMock).toHaveBeenCalled())
    expect(registerMock.mock.calls.at(-1)![0].donor.address).toBeUndefined()
  })
})

describe('Register — documento (CPF/CNPJ)', () => {
  it('bloqueia o cadastro com documento inválido e mostra o erro', async () => {
    const user = userEvent.setup()
    registerMock.mockClear()
    renderRegister()
    await user.type(screen.getByLabelText('Nome'), 'Maria')
    await user.type(screen.getByLabelText('E-mail'), 'maria@mercado.com')
    await user.type(screen.getByLabelText('Senha'), 'Senha1234')
    await user.type(screen.getByLabelText('Nome do estabelecimento'), 'Mercado')
    await user.type(screen.getByLabelText(/^CPF ou CNPJ/), '11222333000180')
    await user.click(screen.getByRole('button', { name: /cadastrar/i }))

    expect(await screen.findByText('Informe um CPF ou CNPJ válido')).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('aplica a máscara enquanto digita', async () => {
    const user = userEvent.setup()
    renderRegister()
    const field = screen.getByLabelText(/^CPF ou CNPJ/)
    await user.type(field, '11222333000181')
    expect(field).toHaveValue('11.222.333/0001-81')
  })
})
