// Envia um e-mail de teste com o SMTP configurado:
//   SMTP_HOST=... SMTP_USER=... SMTP_PASS=... EMAIL_FROM=... npm run email:check -- seu@email.com
import { emailService, isEmailConfigured } from '../src/services/EmailService'

async function main() {
  const to = process.argv[2]
  if (!to) {
    console.error('Uso: npm run email:check -- seu@email.com')
    process.exit(1)
  }
  if (!isEmailConfigured()) {
    console.error('SMTP não configurado: defina SMTP_HOST, SMTP_USER, SMTP_PASS e EMAIL_FROM (veja o DEPLOY.md).')
    process.exit(1)
  }
  const ok = await emailService.send({
    to,
    subject: 'ConectaFome: teste de e-mail',
    text: 'Se você recebeu esta mensagem, o envio de e-mails do ConectaFome está funcionando.',
    action: { label: 'Abrir o ConectaFome', link: '/' },
  })
  console.log(ok ? `OK: e-mail enviado para ${to}. Confira a caixa de entrada e o spam.` : 'FALHOU: veja a mensagem de erro acima.')
  process.exit(ok ? 0 : 1)
}

void main()
