import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Landing } from '../src/pages/Landing'

vi.mock('../src/services/volunteerApplications', () => ({ applyAsVolunteer: vi.fn() }))

const renderLanding = () => render(<MemoryRouter><Landing /></MemoryRouter>)

describe('Landing', () => {
  it('apresenta o projeto e leva a cadastro e login', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1, name: /conectando quem doa a quem precisa/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Começar agora' })).toHaveAttribute('href', '/cadastro')
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
    expect(within(nav).getByRole('link', { name: 'Cadastrar-se' })).toHaveAttribute('href', '/cadastro')
  })

  it('"Saiba mais" e o menu levam às seções da própria página', () => {
    renderLanding()
    expect(screen.getByRole('link', { name: 'Saiba mais' })).toHaveAttribute('href', '#como-funciona')
    expect(document.getElementById('como-funciona')).not.toBeNull()
    expect(document.getElementById('sobre')).not.toBeNull()
    expect(document.getElementById('impacto')).not.toBeNull()
  })

  it('mostra os quatro passos do fluxo e os ODS', () => {
    renderLanding()
    expect(screen.getAllByText(/^Passo \d$/)).toHaveLength(4)
    expect(screen.getByText(/ODS 2/)).toBeInTheDocument()
    expect(screen.getByText(/ODS 12/)).toBeInTheDocument()
  })

  it('cita a fonte do único número que exibe', () => {
    renderLanding()
    expect(screen.getByText(/24,2% dos domicílios/)).toHaveTextContent(/IBGE, PNAD Contínua 2024/)
  })

  it('convida voluntários: link no menu e seção com o formulário de inscrição', () => {
    renderLanding()
    expect(screen.getByRole('link', { name: 'Voluntariado' })).toHaveAttribute('href', '#voluntarios')
    expect(screen.getByRole('form', { name: 'Inscrição de voluntário' })).toBeInTheDocument()
    expect(document.getElementById('voluntarios')).not.toBeNull()
  })
})
