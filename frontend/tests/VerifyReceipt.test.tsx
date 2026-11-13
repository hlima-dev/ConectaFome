import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { VerifyReceipt } from '../src/pages/VerifyReceipt'

const get = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { get } }))

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/verificar/DOA-00042/abc123']}>
      <Routes><Route path="/verificar/:code/:signature" element={<VerifyReceipt />} /></Routes>
    </MemoryRouter>,
  )

describe('VerifyReceipt (página aberta pelo QR code)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('comprovante válido: mostra o essencial e avisa que endereço e documento ficam de fora', async () => {
    get.mockResolvedValue({ data: { data: { valid: true, code: 'DOA-00042', description: 'Marmitas', status: 'ENTREGUE', collectedQuantityKg: 32, collectedAt: '2026-11-02T10:00:00Z', confirmedAt: '2026-11-02T12:00:00Z', donorName: 'Restaurante', recipientName: 'Família atendida' } } })
    renderAt()

    expect(await screen.findByRole('heading', { name: 'Comprovante autêntico' })).toBeInTheDocument()
    expect(screen.getByText('Marmitas')).toBeInTheDocument()
    expect(screen.getByText('32 kg')).toBeInTheDocument()
    expect(screen.getByText('Família atendida')).toBeInTheDocument()
    expect(screen.getByText(/não mostra endereços nem documentos/)).toBeInTheDocument()
    expect(get.mock.calls[0][0]).toContain('/api/v1/public/receipts/DOA-00042/abc123')
  })

  it('assinatura errada ou código falso: mensagem de alerta, sem detalhes', async () => {
    get.mockRejectedValue({ response: { status: 404 } })
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent('Comprovante não encontrado')
  })
})
