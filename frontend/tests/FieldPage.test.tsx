import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FieldPage } from '../src/pages/field/FieldPage'

const api = vi.hoisted(() => ({
  getFieldView: vi.fn(),
  startFieldRoute: vi.fn(),
  collectFieldStop: vi.fn(),
  failFieldStop: vi.fn(),
  finishFieldRoute: vi.fn(),
}))
vi.mock('../src/services/field', () => api)

const donation = (over: Record<string, unknown> = {}) => ({
  id: 'd1', description: 'Pães do dia', estimatedKg: 12, collectedKg: null, storageCondition: 'AMBIENTE',
  status: 'AGENDADA', notes: null, recipientName: 'ONG Mesa', recipientAddress: null, photoCount: 0, ...over,
})

const view = (over: Record<string, unknown> = {}, donations = [donation()]) => ({
  route: { routeNumber: 7, status: 'EM_ANDAMENTO', scheduledFor: '2026-11-10T10:00:00Z', departedAt: null, completedAt: null },
  volunteerName: 'Carlos', vehicle: { plate: 'ABC1D23', model: 'Fiorino' }, expiresAt: '2026-11-12T10:00:00Z', requirePhoto: true,
  stops: [{ sequence: 1, donorName: 'Padaria Central', address: 'Rua A, 10', city: 'Sorocaba', latitude: null, longitude: null, contactName: 'Dona Ana', phone: '(15) 99999-0000', donations }],
  failed: [], ...over,
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/coleta/abc']}>
      <Routes><Route path="/coleta/:token" element={<FieldPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('FieldPage (voluntário)', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getFieldView.mockResolvedValue(view()) })

  it('link inválido mostra a mensagem em vez de quebrar', async () => {
    api.getFieldView.mockRejectedValue({ isAxiosError: true, response: { data: { message: 'Este link não é válido ou já expirou. Peça um novo à administração.' } } })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/não é válido ou já expirou/)
  })

  it('mostra parada, endereço, link do mapa, telefone e o que coletar', async () => {
    renderPage()
    expect(await screen.findByText('Padaria Central')).toBeInTheDocument()
    expect(screen.getByText('Rua A, 10, Sorocaba')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /abrir no mapa/i })).toHaveAttribute('href', expect.stringContaining('google.com/maps/search'))
    expect(screen.getByRole('link', { name: /ligar/i })).toHaveAttribute('href', 'tel:(15)999990000'.replace(/[()]/g, ''))
    expect(screen.getByText('Pães do dia')).toBeInTheDocument()
  })

  it('rota planejada oferece "Iniciar rota" e não mostra botões de coleta', async () => {
    api.getFieldView.mockResolvedValue(view({ route: { routeNumber: 7, status: 'PLANEJADA', scheduledFor: '', departedAt: null, completedAt: null } }))
    api.startFieldRoute.mockResolvedValue(view())
    const user = userEvent.setup()
    renderPage()

    const start = await screen.findByRole('button', { name: /iniciar rota/i })
    expect(screen.queryByRole('button', { name: 'Coletei' })).not.toBeInTheDocument()

    await user.click(start)
    expect(api.startFieldRoute).toHaveBeenCalledWith('abc')
    // depois de iniciar, aparecem os botões de coleta
    expect(await screen.findByRole('button', { name: 'Coletei' })).toBeInTheDocument()
  })

  it('exige foto para confirmar a coleta e envia foto e peso', async () => {
    api.collectFieldStop.mockResolvedValue(view({}, [donation({ status: 'COLETADA', collectedKg: 11.5 })]))
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Coletei' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirmar coleta/i }))
    expect(await within(dialog).findByText(/ao menos uma foto/i)).toBeInTheDocument()
    expect(api.collectFieldStop).not.toHaveBeenCalled()

    await user.upload(within(dialog).getByLabelText('Escolher fotos da galeria'), new File([new Uint8Array(2048)], 'a.jpg', { type: 'image/jpeg' }))
    await within(dialog).findByAltText('Foto 1 selecionada')
    await user.type(within(dialog).getByLabelText(/peso coletado/i), '11,5')
    await user.click(within(dialog).getByRole('button', { name: /confirmar coleta/i }))

    await waitFor(() => expect(api.collectFieldStop).toHaveBeenCalledTimes(1))
    const [token, id, files, kg] = api.collectFieldStop.mock.calls[0]
    expect([token, id, files.length, kg]).toEqual(['abc', 'd1', 1, 11.5])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('com a exigência de foto desligada, coleta sem foto', async () => {
    api.getFieldView.mockResolvedValue(view({ requirePhoto: false }))
    api.collectFieldStop.mockResolvedValue(view({ requirePhoto: false }))
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Coletei' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /confirmar coleta/i }))
    await waitFor(() => expect(api.collectFieldStop).toHaveBeenCalledWith('abc', 'd1', [], undefined))
  })

  it('"Não consegui" registra o motivo escolhido', async () => {
    api.failFieldStop.mockResolvedValue(view({}, [donation({ status: 'RESERVADA' })]))
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Não consegui' }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('O que aconteceu?'), 'DOADOR_AUSENTE')
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }))

    await waitFor(() => expect(api.failFieldStop).toHaveBeenCalledWith('abc', 'd1', 'DOADOR_AUSENTE', '', []))
  })

  it('só deixa finalizar quando todas as paradas foram resolvidas', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPage()
    expect(await screen.findByRole('button', { name: /finalizar rota/i })).toBeDisabled()
    expect(screen.getByText(/Falta resolver 1 parada/)).toBeInTheDocument()
    unmount()

    api.getFieldView.mockResolvedValue(view({}, [donation({ status: 'COLETADA' })]))
    api.finishFieldRoute.mockResolvedValue(view({ route: { routeNumber: 7, status: 'CONCLUIDA', scheduledFor: '', departedAt: null, completedAt: 'x' } }, [donation({ status: 'COLETADA' })]))
    renderPage()
    const finish = await screen.findByRole('button', { name: /finalizar rota/i })
    expect(finish).toBeEnabled()
    await user.click(finish)
    expect(await screen.findByText(/Rota concluída\./)).toBeInTheDocument()
  })
})
