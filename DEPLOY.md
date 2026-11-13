# Publicação (Supabase + Render + Vercel)

Este guia leva o ConectaFome do repositório ao ar. **Ele não foi executado de
ponta a ponta**: o ambiente de desenvolvimento não tem acesso a essas
plataformas. O que foi validado localmente é o caminho de produção (build,
migração, seed só do administrador, `npm start`, `scripts/smoke.sh`). Rode o
smoke test abaixo depois de publicar para confirmar.

## 1. Banco de dados (Supabase)

1. Crie um projeto e copie a *connection string* do Postgres (modo *pooler* ou
   direta). Ela será o `DATABASE_URL`.
2. Não crie tabelas à mão: as migrações rodam sozinhas no deploy do backend.

## 2. Backend (Render)

1. No Render: **New + → Blueprint**, conecte o repositório. O `render.yaml`
   cria o serviço `conectfome-backend` (plano gratuito, `healthCheckPath: /health`).
2. Preencha as variáveis marcadas como obrigatórias:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string do Supabase |
| `CORS_ORIGINS` | URL do frontend, sem barra no final (ex.: `https://conecta-fome.vercel.app`). Vários separados por vírgula; qualquer `*.vercel.app` em https já é aceito |
| `APP_URL` | a mesma URL do frontend |
| `ADMIN_EMAIL` | e-mail do primeiro administrador |
| `ADMIN_PASSWORD` | senha forte (12+ caracteres). **Não use `Conect@123`**: o seed recusa |

`JWT_SECRET` e `JWT_REFRESH_SECRET` são gerados pelo Render.

3. No primeiro início o comando `npm run db:migrate:prod && npm run db:seed &&
   npm start` aplica as migrações e cria **somente** o administrador. Se
   `ADMIN_EMAIL`/`ADMIN_PASSWORD` faltarem, o seed falha de propósito e o
   deploy não sobe (isso evita publicar com uma conta conhecida).
4. Opcional, só para uma demonstração pública com dados de exemplo: defina
   `SEED_DEMO=true`. Isso cria contas com a **senha pública** do README;
   não deixe ligado num ambiente com dados reais.

Observação do plano gratuito: o serviço "dorme" após ~15 minutos sem uso e
a primeira requisição depois disso demora (~1 min). O agendador do passo 6 o
mantém acordado; sem ele, abra o endereço alguns minutos antes de qualquer
demonstração.

Variáveis novas (já constam no `render.yaml`; as marcadas "pede" o Render
pergunta ao aplicar o Blueprint):

| Variável | Para quê |
|---|---|
| `CRON_SECRET` | segredo do agendador (passo 6). O Render gera; copie para o GitHub |
| `REQUIRE_APPROVAL` | `true`: cadastro novo só doa/reserva depois de aprovado |
| `RESERVATION_HOLD_HOURS` | horas até uma reserva parada voltar ao painel (24; `0` desliga) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | pede. Armazenamento das fotos (passo 7). Sem elas, fotos ficam desligadas |
| `REQUIRE_OFFER_PHOTO`, `REQUIRE_PICKUP_PHOTO` | `true`: oferta e coleta exigem foto (só valem com o armazenamento configurado) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | pede. E-mails (passo 8). Opcional |
| `TRUST_PROXY` | `2` (Render + proxy da Vercel): faz o limite de tentativas ser por pessoa |

## 3. Frontend (Vercel)

1. **Add New → Project**, importe o repositório e defina **Root Directory =
   `frontend`**.
2. **Não defina `VITE_API_URL`** em produção. O `frontend/vercel.json` encaminha
   `/api/v1/*` para o backend no Render, então o navegador fala só com o domínio
   da Vercel e o cookie de login deixa de ser "de terceiros" (Safari e navegadores
   de celular bloqueiam esse tipo de cookie). Se o seu backend tiver outro
   endereço que não `conectfome-backend.onrender.com`, troque-o no `vercel.json`.
3. O mesmo arquivo redireciona qualquer outra rota para o `index.html`
   (necessário para `/inicio`, `/doacoes` etc. funcionarem ao recarregar).
4. Depois de publicar, volte ao Render e confirme que `CORS_ORIGINS` e
   `APP_URL` têm a URL final do frontend.

## 4. Conferir (teste de fumaça)

```bash
scripts/smoke.sh https://SEU-BACKEND.onrender.com https://SEU-FRONTEND.vercel.app seu-admin@org.br 'sua-senha'
```

Ele verifica: `/health`, rota protegida (401), 404, cabeçalhos de segurança,
CORS liberado só para o frontend, frontend e rotas do app, **que a senha
pública não entra como administrador** e que o login do administrador
configurado funciona. Termina com `TUDO OK` ou `HÁ FALHAS`.

## 5. Depois de publicar

- Cadastre o endereço completo (rua, número, cidade) de doadores e receptores:
  é dele que sai o mapa das rotas. Para cadastros que já existiam:
  `DATABASE_URL=... npm run db:geocode` (dentro de `backend/`).
- A geocodificação usa o serviço público do OpenStreetMap, limitado a 1
  consulta por segundo; não use para importar milhares de endereços.
- Se for entregar o link no trabalho, coloque o endereço na Seção 1 da
  documentação.

## 6. Agendador (mantém o servidor acordado e roda a manutenção)

O servidor gratuito do Render dorme e não consegue rodar tarefas por conta própria.
Por isso o GitHub Actions chama o backend a cada 15 minutos
(`.github/workflows/manutencao.yml`): acorda o servidor, toca o banco e executa a
rotina que **vence doações fora do prazo** e **devolve ao painel reservas paradas**.

1. No Render, copie o valor de `CRON_SECRET` (Environment).
2. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `API_URL` = endereço do backend, sem barra no final
   - `CRON_SECRET` = o valor copiado
3. Em **Actions → Manutenção do ConectaFome → Run workflow**, rode uma vez e confira o `OK`.

Limites do plano gratuito: o GitHub pode atrasar a execução em alguns minutos; em
repositório **público** ele desativa agendamentos após 60 dias sem atividade (um commit
resolve, ou reative em Actions); e o Render gratuito oferece ~750 h por mês, o que
cobre um serviço ligado o mês inteiro. Sem o agendador o sistema funciona, mas a
verificação de prazos só acontece quando a administração clica em "Verificar prazos agora".

## 7. Fotos (Supabase Storage)

O disco do Render gratuito é **apagado a cada deploy**, então as fotos precisam ficar
fora dele.

1. No Supabase: **Storage → New bucket**, nome `doacoes`, **desmarque "Public bucket"**
   (o bucket tem de ser privado: as imagens só saem pelo sistema, conferindo quem pode ver).
2. **Project Settings → API**: copie a **Project URL** e a chave **secreta** (`sb_secret_...`,
   ou a antiga `service_role`). Essa chave dá acesso total ao projeto: **nunca** a coloque
   no frontend, no GitHub ou em conversas.
3. No Render (Environment): `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`.
4. Confira de verdade, na sua máquina, antes de depender disso:

```bash
cd backend
SUPABASE_URL='https://SEU-PROJETO.supabase.co' SUPABASE_SERVICE_KEY='sb_secret_...' npm run storage:check
```

Ele grava, lê e apaga uma imagem de teste e termina com `OK`. Se falhar, a mensagem diz
o que conferir. **Este caminho com o Supabase não foi testado contra o serviço real** no
desenvolvimento (só contra um servidor simulado), por isso o `storage:check` existe.

Limite gratuito do Supabase Storage: 1 GB. Cada foto sai com ~60 a 200 KB, então
cabem milhares de fotos. Sem as duas variáveis, o recurso de fotos fica **desligado**
(nada é exigido nem aceito), para nunca guardar foto num lugar que se apaga.

## 8. E-mail (opcional)

Sem e-mail, os avisos aparecem só dentro do sistema e "esqueci minha senha" depende da
administração gerar o link (botão **Link de senha** nas telas de Doadores/Receptores).
Com e-mail, os avisos chegam também na caixa de entrada.

Opção gratuita que não exige domínio próprio: **Brevo** (300 e-mails/dia). Crie a conta,
valide um e-mail remetente e gere uma chave SMTP; depois no Render:
`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`
(ex.: `ConectaFome <seu-email-validado@gmail.com>`). Teste:

```bash
cd backend
SMTP_HOST=... SMTP_USER=... SMTP_PASS=... EMAIL_FROM='ConectaFome <...>' npm run email:check -- seu@email.com
```

Há um teto de 30 e-mails por evento (`EMAIL_MAX_PER_EVENT`) para uma doação nova não
estourar o limite diário avisando todos os receptores da cidade.

## 9. Backup e cuidados com os planos gratuitos

- **Banco (Supabase gratuito):** não há backup restaurável por conta própria e o projeto
  **pausa após 7 dias sem atividade** (o agendador do passo 6 evita isso; confirme as
  regras atuais no painel do Supabase). Faça uma cópia semanal:
  `DATABASE_URL='...' bash scripts/backup.sh` (gera um `.sql.gz`; contém dados pessoais:
  guarde em lugar privado, nunca no GitHub). As **fotos** não entram nesse arquivo.
- **Monitoramento:** não há alerta de erro automático. Olhe **Logs** no Render quando algo
  parecer estranho e use `/health` como verificação rápida.
- **Antes de entregar o sistema a ONGs reais:** passe pelo checklist abaixo.

### Checklist antes de usar com ONGs

- [ ] `scripts/smoke.sh` termina com `TUDO OK`
- [ ] Workflow de manutenção rodou com sucesso (passo 6)
- [ ] `npm run storage:check` terminou com `OK` e `SUPABASE_*` estão no Render (passo 7)
- [ ] Senha do administrador é forte e só a administração a conhece
- [ ] Criou uma conta de doador, uma de receptor, aprovou ambas e fez uma doação de ponta a ponta, com foto
- [ ] Testou o link do voluntário no celular (tela da rota → **Link para o voluntário**)
- [ ] Testou o login no celular (Chrome e, se houver iPhone, Safari)
- [ ] Definiu quem aprova cadastros e em quanto tempo (a fila aparece no Painel)
- [ ] Fez um backup (passo 9) e sabe onde ele está
