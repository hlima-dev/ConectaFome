import nodemailer, { Transporter } from 'nodemailer'
import { env } from '../config/env'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  // Botão de ação (opcional): rótulo + caminho dentro do sistema ou URL completa.
  action?: { label: string; link: string }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function absoluteLink(link: string): string {
  return /^https?:\/\//.test(link) ? link : `${env.APP_URL.replace(/\/$/, '')}${link.startsWith('/') ? '' : '/'}${link}`
}

export function renderEmail(message: EmailMessage): { html: string; text: string } {
  const url = message.action ? absoluteLink(message.action.link) : null
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#064e3b;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">ConectaFome</div>
<div style="background:#fff;padding:24px 20px;border-radius:0 0 12px 12px;line-height:1.5">
<p style="margin:0 0 16px">${escapeHtml(message.text).replace(/\n/g, '<br>')}</p>
${url ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#047857;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${escapeHtml(message.action!.label)}</a></p>
<p style="margin:0;font-size:12px;color:#64748b">Se o botão não abrir, copie este endereço: ${escapeHtml(url)}</p>` : ''}
</div>
<p style="font-size:12px;color:#64748b;text-align:center;margin:16px 0 0">Você recebeu este e-mail por ter cadastro no ConectaFome.</p>
</div></body></html>`
  return { html, text: url ? `${message.text}\n\n${message.action!.label}: ${url}` : message.text }
}

export function isEmailConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM)
}

// Envio de e-mail por SMTP. É sempre "melhor esforço": nunca lança erro para
// quem chamou (um e-mail que falha não pode desfazer uma doação). Sem SMTP
// configurado, não faz nada e devolve false.
export class EmailService {
  private transporter: Transporter | null = null

  // `transport` existe para os testes injetarem um transporte falso.
  constructor(private transport?: Transporter) {}

  private get client(): Transporter | null {
    if (this.transport) return this.transport
    if (!isEmailConfigured()) return null
    this.transporter ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    return this.transporter
  }

  get enabled(): boolean {
    return this.client !== null
  }

  async send(message: EmailMessage): Promise<boolean> {
    const client = this.client
    if (!client) return false
    try {
      const { html, text } = renderEmail(message)
      await client.sendMail({ from: env.EMAIL_FROM ?? 'ConectaFome <no-reply@conectafome.local>', to: message.to, subject: message.subject, text, html })
      return true
    } catch (error) {
      console.error('Falha ao enviar e-mail', error instanceof Error ? error.message : error)
      return false
    }
  }
}

export const emailService = new EmailService()
