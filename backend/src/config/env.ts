import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Limites de requisições por IP a cada 15 min. Os padrões valem em produção; só
  // aumente em ambiente de teste/captura (ex.: scripts/capturar-telas.cjs).
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // Quantos proxies reversos existem entre o cliente e o app (Render = 1; com
  // proxy da Vercel na frente = 2). Sem isso o limite de requisições enxerga
  // o IP do proxy e todos os usuários dividem o mesmo contador.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Cadastros públicos entram PENDENTE até a administração aprovar. Em um
  // piloto fechado dá para desligar (REQUIRE_APPROVAL=false), mas o padrão é seguro.
  REQUIRE_APPROVAL: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? true : value !== 'false')),
  // Horas que uma reserva feita pelo próprio receptor pode ficar sem entrar em
  // uma rota antes de a doação voltar a ficar disponível. 0 desliga.
  RESERVATION_HOLD_HOURS: z.coerce.number().min(0).default(24),
  // Segredo do agendador externo (GitHub Actions) que chama /maintenance/run.
  // Sem ele, a rota fica desligada. Mínimo de 24 caracteres.
  CRON_SECRET: z.string().min(24, 'CRON_SECRET deve ter ao menos 24 caracteres').optional(),
  // E-mail (opcional). Sem SMTP configurado o sistema funciona igual, só sem e-mail.
  // Planos gratuitos que servem: Brevo (300/dia, remetente verificado por e-mail, sem
  // domínio próprio), Gmail com senha de app, Mailjet. Veja o DEPLOY.md.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Teto de e-mails por evento (uma doação nova avisa todos os receptores da cidade).
  EMAIL_MAX_PER_EVENT: z.coerce.number().int().min(1).default(30),
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Geocodificação (endereço -> latitude/longitude) via Nominatim/OpenStreetMap.
  // Desligada nos testes. O serviço público limita a 1 requisição por segundo e
  // exige um User-Agent que identifique a aplicação (sem dados pessoais).
  GEOCODING_ENABLED: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  GEOCODING_URL: z.string().url().default('https://nominatim.openstreetmap.org/search'),
  GEOCODING_USER_AGENT: z.string().default('ConectaFome/1.0 (projeto academico; github.com/hlima-dev/ConectaFome)'),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('Variaveis de ambiente invalidas:')
  console.error(_env.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = {
  ..._env.data,
  // Padrão: ligada, exceto nos testes.
  GEOCODING_ENABLED: _env.data.GEOCODING_ENABLED ?? _env.data.NODE_ENV !== 'test',
}
