import { describe, it, expect, vi } from 'vitest'
import nodemailer from 'nodemailer'
import { EmailService, absoluteLink, isEmailConfigured, renderEmail } from '../src/services/EmailService'

describe('EmailService', () => {
  it('sem SMTP configurado não envia e não quebra', async () => {
    expect(isEmailConfigured()).toBe(false)
    const service = new EmailService()
    expect(service.enabled).toBe(false)
    expect(await service.send({ to: 'a@b.com', subject: 's', text: 't' })).toBe(false)
  })

  it('envia com texto e HTML, com botão e endereço completo', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true })
    const sendMail = vi.spyOn(transport, 'sendMail')
    const service = new EmailService(transport)

    const ok = await service.send({ to: 'ong@x.org', subject: 'Reserva', text: 'Sua doação foi reservada.', action: { label: 'Abrir a doação', link: '/doacoes/abc' } })

    expect(ok).toBe(true)
    const sent = sendMail.mock.calls[0][0] as { to: string; html: string; text: string }
    expect(sent.to).toBe('ong@x.org')
    expect(sent.html).toContain('Abrir a doação')
    expect(sent.html).toContain('http://localhost:5173/doacoes/abc')
    expect(sent.text).toContain('http://localhost:5173/doacoes/abc')
  })

  it('uma falha de envio devolve false e não lança erro (nunca derruba a ação principal)', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true })
    vi.spyOn(transport, 'sendMail').mockRejectedValue(new Error('SMTP fora do ar'))
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await new EmailService(transport).send({ to: 'a@b.com', subject: 's', text: 't' })).toBe(false)
    quiet.mockRestore()
  })

  it('escapa HTML do texto (nada de injeção por nome de doação)', () => {
    const { html } = renderEmail({ to: 'a@b.com', subject: 's', text: 'Doação "<script>alert(1)</script>"' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('absoluteLink junta o endereço do sistema ao caminho e preserva URL completa', () => {
    expect(absoluteLink('/x')).toBe('http://localhost:5173/x')
    expect(absoluteLink('x')).toBe('http://localhost:5173/x')
    expect(absoluteLink('https://outro.com/y')).toBe('https://outro.com/y')
  })
})
