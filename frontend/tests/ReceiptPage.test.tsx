import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReceiptPage } from '../src/pages/donations/ReceiptPage'

const useDonationReceipt = vi.hoisted(() => vi.fn())
vi.mock('../src/hooks/useDonations', () => ({ useDonationReceipt }))
vi.mock('../src/components/ReceiptQr', () => ({ ReceiptQr: ({ code, signature }: { code: string; signature: string }) => <div data-testid="qr">{code}:{signature}</div> }))

const receipt = {
  number: 'DOA-00042',
  verification: { code: 'DOA-00042', signature: 'abcdef0123456789abcd' },
  issuedAt: '2026-11-05T12:00:00Z',
  donor: { name: 'Padaria Central', document: '11.222.333/0001-44', address: 'Rua A, 1, Sorocaba, SP' },
  recipient: { name: 'ONG Mesa Solidária', document: null, address: 'Votorantim' },
  donation: {
    description: 'Marmitas do almoço',
    category: 'PREPARADO',
    storageCondition: 'REFRIGERADO',
    estimatedQuantityKg: 35,
    collectedQuantityKg: 32,
    status: 'ENTREGUE',
    bestBeforeDate: null,
    termsAcceptedAt: '2026-11-01T10:00:00Z',
    registeredAt: '2026-11-01T10:00:00Z',
    collectedAt: '2026-11-02T10:00:00Z',
    confirmedAt: null,
  },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/doacoes/x/comprovante']}>
      <Routes>
        <Route path="/doacoes/:id/comprovante" element={<ReceiptPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ReceiptPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDonationReceipt.mockReturnValue({ data: receipt, isLoading: false, error: null })
  })

  it('mostra número, partes, quantidade coletada e o aviso de que não é documento fiscal', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /comprovante de doação de alimentos/i })).toBeInTheDocument()
    expect(screen.getByText('DOA-00042')).toBeInTheDocument()
    expect(screen.getByText('Padaria Central')).toBeInTheDocument()
    expect(screen.getByText('11.222.333/0001-44')).toBeInTheDocument()
    expect(screen.getByText('ONG Mesa Solidária')).toBeInTheDocument()
    expect(screen.getByText('32 kg')).toBeInTheDocument()
    expect(screen.getByText('35 kg')).toBeInTheDocument()
    expect(screen.getByText(/não substitui nota fiscal/i)).toBeInTheDocument()
  })

  it('o botão chama a impressão do navegador', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    await user.click(screen.getByRole('button', { name: /imprimir/i }))
    expect(print).toHaveBeenCalled()
  })

  it('mostra o motivo quando o comprovante não pode ser emitido', () => {
    useDonationReceipt.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { isAxiosError: true, response: { data: { message: 'O comprovante só pode ser emitido depois que a doação for coletada' } } },
    })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent(/depois que a doação for coletada/)
  })

  it('carregando', () => {
    useDonationReceipt.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderPage()
    expect(screen.getByText(/carregando comprovante/i)).toBeInTheDocument()
  })
})
