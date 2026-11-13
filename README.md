# 🍎 ConectaFome

**Acesse o sistema:** https://conecta-fome.vercel.app  
_(o primeiro acesso pode levar cerca de 1 minuto: o servidor gratuito "dorme" quando fica sem uso.)_

Plataforma de doação e resgate de alimentos que conecta **doadores**
(mercados, restaurantes, feiras) a **receptores** (ONGs e famílias em
situação de vulnerabilidade), redistribuindo alimentos que seriam
descartados. Projeto de faculdade baseado nos Objetivos de
Desenvolvimento Sustentável da ONU.

## Sobre o projeto e os ODS

Todos os dias, mercados, restaurantes e feiras descartam alimentos em
condições de consumo — só não vendáveis pelo padrão estético ou pelo
prazo comercial, não pela segurança alimentar. Do outro lado, ONGs e
famílias em vulnerabilidade enfrentam insegurança alimentar diária. O
ConectaFome existe para fechar essa distância: cadastro de doadores e
receptores, agendamento de coleta com rotas e voluntários, e um
relatório de quanto alimento foi efetivamente resgatado por mês.

- **ODS 2 — Fome Zero**: cada doação que chega a `ENTREGUE` é comida que
  chegou a quem precisava, em vez de ser descartada. O ciclo de status
  da doação (abaixo) existe justamente para que essa entrega seja um
  evento registrado e mensurável, não uma promessa.
- **ODS 12 — Consumo e Produção Responsáveis**: o alimento resgatado é
  produção que já aconteceu — energia, água e trabalho já gastos — que
  o ConectaFome evita jogar fora. O relatório de kg resgatado por mês
  (`/relatorios`) é o indicador direto desse impacto, e o estado
  `VENCIDA` existe para tornar visível, e não esconder, o que ainda se
  perde antes da coleta.

## O que o sistema faz hoje

- **Cadastro com confiança:** CPF/CNPJ validado pelos dígitos verificadores; todo
  cadastro novo passa por aprovação da administração antes de doar ou reservar.
- **Doação com foto:** o doador fotografa o alimento ao cadastrar; o voluntário
  fotografa cada parada na coleta (pelo **link da rota**, no celular, sem conta);
  o receptor pode fotografar o recebimento. As fotos são reduzidas, sem dados de
  localização, e só aparecem a quem faz parte da doação.
- **Reserva e rota:** o receptor reserva pelo painel (da mais urgente para a menos);
  a administração monta a rota com veículo e voluntário, mapa e controle de carga.
- **Coleta parada a parada:** coletada, ou não coletada com motivo (doador ausente,
  recusou, impróprio, sem espaço); o que falha volta para reagendar ou é cancelado.
- **Prazos automáticos:** doação fora do prazo vira vencida e reserva parada volta ao
  painel (agendador no GitHub Actions, porque o servidor gratuito dorme).
- **Painel da administração com fila de pendências:** o que precisa de ação agora
  (aprovações, urgentes, reservadas sem rota, coletadas sem confirmação, sem foto).
- **Comprovante** com código `DOA-00042` e QR code que leva a uma página pública de
  conferência de autenticidade (sem endereços nem documentos).
- **Recuperação de senha** por e-mail ou por link gerado pela administração; **avisos
  por e-mail** opcionais.
- Relatórios com período, indicadores e exportação CSV.

Como publicar (inclusive os limites dos planos gratuitos) e o checklist para usar com
ONGs reais: **[DEPLOY.md](DEPLOY.md)**.

## Arquitetura

Monorepo com backend e frontend separados, mesma fundação de auth/
estrutura do projeto ATHLO (Node/Express/Prisma) e o mesmo raciocínio de
modelagem de logística do PRODUCTION ERP (veículo/motorista/romaneio →
aqui veículo/voluntário/rota de coleta), reimplementados em Prisma —
não código copiado, já que os stacks de origem são diferentes.

```
ConectaFome/
├── backend/                  # Node + Express + TypeScript + Prisma + PostgreSQL
│   ├── prisma/
│   │   ├── schema.prisma     # modelos e enums (ver o arquivo)
│   │   └── seed.ts           # dados de exemplo (idempotente)
│   ├── src/
│   │   ├── config/           # env (Zod) e cliente Prisma
│   │   ├── controllers/      # validação (Zod) + chamada ao service
│   │   ├── services/         # regra de negócio
│   │   ├── middlewares/      # auth, CSRF, rate limit, erro
│   │   ├── routes/           # mapeamento REST
│   │   ├── storage/          # armazenamento de fotos (Supabase Storage ou disco local)
│   │   └── utils/            # AppError, JWT, cookies, paginação, imagem, CPF/CNPJ
│   └── tests/                # Vitest — services e middlewares
└── frontend/                 # React + Vite + TypeScript + Tailwind
    └── src/
        ├── components/       # DataTable, Modal, ConfirmDialog, StatusBadge
        ├── layouts/          # AppLayout (nav por papel)
        ├── routes/           # PrivateRoute, RoleRoute
        ├── services/         # chamadas à API (axios)
        ├── hooks/            # TanStack Query
        ├── pages/            # telas, organizadas por módulo
        └── types/            # tipos e labels de cada domínio
```

## Papéis e autenticação

Três papéis: **ADMIN** (nasce só via seed, nunca por cadastro público),
**DOADOR** e **RECEPTOR**. Login em cookies httpOnly (access + refresh),
proteção CSRF por dupla submissão, bloqueio de conta após 5 tentativas
de senha erradas em 15 minutos, e mensagens de erro genéricas no login
pra não vazar quais e-mails existem.

O cadastro público (`/cadastro`) cria o `User` e, na mesma transação, o
perfil `Donor` ou `Recipient` vinculado, conforme o papel escolhido.

## O ciclo da doação (o hub do projeto)

```
DISPONÍVEL → RESERVADA → AGENDADA → COLETADA → ENTREGUE
    │             │
    └── CANCELADA ┘
    └── VENCIDA ───┘
```

- **DISPONÍVEL**: o doador cadastrou, ainda sem receptor.
- **RESERVADA**: um receptor ficou com a doação — ou ele mesmo reservou
  pelo painel de Oportunidades, ou o admin casou (e pode reatribuir). O
  receptor pode liberar a reserva enquanto a doação não estiver numa rota.
- **AGENDADA**: entrou numa rota de coleta planejada.
- **COLETADA**: a rota foi concluída — o voluntário coletou de fato.
  **Esse é o evento que conta como "resgatado" no relatório.**
- **ENTREGUE**: o receptor confirmou o recebimento — ação própria dele,
  independente da rota.
- **CANCELADA** / **VENCIDA**: saídas a partir dos estados iniciais,
  registrando o que não virou resgate — o contraste com o que foi
  resgatado é, em si, parte do indicador de ODS 12.

Cada estado é uma ação distinta e rastreável, em vez de um único campo
"concluído" — é isso que permite ao relatório separar "resgatado" de
"entregue" de "perdido".

**Histórico (quem fez, quando).** Toda transição grava um `DonationEvent`
(ação, estado de origem e destino, usuário, data) na mesma transação que
muda o estado, e a tela da doação mostra a linha do tempo
(`GET /api/v1/donations/:id/events`). Doações anteriores à existência do
histórico não têm eventos.

**Urgência.** Cada doação ainda não coletada traz `urgency`: o prazo é o
que vencer primeiro entre a validade (até o fim do dia) e o fim da janela
de coleta; abaixo de 24 h é "urgente" e passado o prazo é "encerrado".
Doações com prazo encerrado somem do painel de oportunidades e não podem
ser reservadas (cabe ao doador ou ao admin marcá-las como vencidas).

**Reserva sem corrida.** A reserva pelo receptor é uma troca de estado
condicional (só se ainda estiver DISPONÍVEL) dentro de uma transação: se
duas ONGs reservam ao mesmo tempo, uma vence e a outra recebe 409. Há teste
de integração para isso.

**Notificações.** Geradas depois que a transição já foi gravada e em
regime de melhor esforço: uma falha ao notificar nunca desfaz a ação. Não
avisam o autor da ação. Uma nova doação avisa os receptores ativos da
mesma cidade do doador (todos, se o doador não informou cidade) e os
administradores. A interface consulta a cada 30 s.

**Rota com mapa.** O detalhe da rota (`GET /api/v1/pickup-routes/:id`) traz
`plan` e `load`. As paradas são os doadores (várias doações do mesmo doador
= uma parada), ordenadas por **vizinho mais próximo** a partir da parada de
prazo mais curto, com distância em **linha reta** (haversine). É uma
heurística de apoio à decisão: não considera ruas, trânsito nem janelas de
tempo e não garante a rota mais curta. Doadores sem coordenadas aparecem em
um aviso, fora do mapa e da distância.

**Capacidade do veículo.** A tela mostra a carga estimada contra
`capacityKg`; anexar acima da capacidade é permitido (com alerta), mas
**iniciar a rota** é bloqueado. Veículo sem capacidade cadastrada não é
verificado. Ao concluir, o administrador pode informar o kg realmente
coletado de cada doação (o padrão é a quantidade estimada).

**Geocodificação.** Ao criar ou alterar o endereço de um doador/receptor, o
backend busca latitude/longitude no Nominatim (OpenStreetMap) **em segundo
plano**, sem atrasar a resposta; falha nunca impede o cadastro. O serviço
público limita a 1 requisição por segundo e exige identificação
(`GEOCODING_USER_AGENT`), por isso há fila com intervalo mínimo e cache.
Variáveis: `GEOCODING_ENABLED` (padrão: ligada, exceto nos testes),
`GEOCODING_URL`, `GEOCODING_USER_AGENT`. Para preencher cadastros
existentes: `npm run db:geocode`. Os testes usam um servidor HTTP local no
lugar do Nominatim; **não** há teste automatizado contra o serviço real.

**Comprovante.** `GET /api/v1/donations/:id/receipt` (administrador ou o
doador dono) devolve os dados do comprovante de uma doação **já coletada**; a
tela `/doacoes/:id/comprovante` o mostra para imprimir ou salvar em PDF pelo
navegador. É um documento do sistema, sem valor fiscal.

**Indicadores e exportação.** `GET /api/v1/reports/rates?from=&to=` (datas
AAAA-MM-DD, fim inclusivo, por data de registro da doação) devolve taxas de
resgate, perda e entrega (frações, ou `null` sem base de cálculo), kg
resgatado e perdido, tempo médio até a coleta (ignora coleta anterior ao
registro) e pessoas atendidas (soma de `peopleServed` das instituições com ao
menos uma entrega no período, cada uma contada uma vez).
`GET /api/v1/reports/donations.csv` exporta as doações do período em CSV
para Excel em português (`;`, decimal com vírgula, BOM UTF-8, datas em
horário de Brasília), com proteção contra injeção de fórmula nos campos
livres.

**Segurança sanitária.** O doador declara que o alimento está próprio para
consumo (a data da declaração fica registrada) e informa a condição de
armazenamento até a coleta — obrigatória para perecíveis e preparados. É
uma declaração: o sistema não mede temperatura.

## Módulos

| Módulo | O que faz | Quem acessa |
|---|---|---|
| Doadores / Receptores | Cadastro, edição e desativação (soft delete) | ADMIN (CRUD completo); o próprio dono vê/edita seu cadastro |
| Doações | Criar, casar/reatribuir, cancelar, marcar vencida, confirmar recebimento, histórico | DOADOR (as próprias), RECEPTOR (as suas), ADMIN (todas) |
| Oportunidades | Painel das doações disponíveis, da mais urgente para a menos, com filtro por cidade e categoria; reservar e liberar | RECEPTOR |
| Notificações | Sino com avisos dos eventos da doação (nova doação, reserva, rota, coleta, entrega, cancelamento) | Todos (cada um vê só as suas) |
| Voluntários / Veículos | Cadastro simples, com edição | ADMIN |
| Rotas de coleta | Criar, anexar/desanexar doação, mapa e ordem sugerida das paradas, carga x capacidade, iniciar, concluir (com kg coletado), cancelar | ADMIN |
| Relatórios | Kg resgatado por mês, por doador e por receptor, taxas do período, tempo até a coleta, pessoas atendidas, exportação CSV | ADMIN |

## Setup local

Pré-requisitos: Node 20+, PostgreSQL 16+.

```bash
git clone https://github.com/hlima-dev/ConectaFome.git
cd ConectaFome

# banco de dados
sudo -u postgres psql -c "CREATE ROLE conectfome LOGIN PASSWORD 'conectfome';"
sudo -u postgres psql -c "CREATE DATABASE conectfome_db OWNER conectfome;"

# backend
cd backend
cp .env.example .env      # ajuste DATABASE_URL/JWT_SECRET se preciso
npm install
npx prisma migrate dev
npm run db:seed
npm run dev                # http://localhost:3333

# frontend (em outro terminal)
cd ../frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

### Credenciais de exemplo (seed) — só para desenvolvimento

Senha de todas as contas: `Conect@123`. **Essa senha é pública.** Em
`NODE_ENV=production` o seed **não** cria essas contas: cria apenas o
administrador definido em `ADMIN_EMAIL` e `ADMIN_PASSWORD` (mínimo de 12
caracteres, diferente da senha pública) e falha se faltarem. Para uma demo
pública com dados de exemplo é preciso optar explicitamente com
`SEED_DEMO=true`.

| Papel | E-mail | Perfil |
|---|---|---|
| ADMIN | admin@conectfome.org | — |
| DOADOR | mercado@conectfome.org | Mercado Bom Preço |
| DOADOR | restaurante@conectfome.org | Restaurante Sabor Caseiro |
| RECEPTOR | ong@conectfome.org | ONG Mesa Solidária |
| RECEPTOR | familia@conectfome.org | Lar da Vovó Joana (família) |

O seed também cria 2 voluntários, 2 veículos e doações de exemplo em
`DISPONÍVEL`, `RESERVADA`, `VENCIDA` e uma já `ENTREGUE` no mês
anterior (pra o gráfico de relatório mostrar mais de um mês).

## Publicação

Veja [DEPLOY.md](DEPLOY.md) (Supabase + Render + Vercel) e `scripts/smoke.sh`.

## Testes

```bash
cd backend  && npm run test              # unitários (Prisma simulado) — services e middlewares
cd backend  && npm run test:integration  # contra PostgreSQL real (ver abaixo)
cd frontend && npm run test              # testes de componente
```

Os testes unitários usam Prisma mockado (`vi.mock`). Os de integração
(`backend/tests/integration`) rodam contra um PostgreSQL real e cobrem o
ciclo completo da doação com histórico, reserva concorrente, notificações,
plano de rota e capacidade, indicadores e CSV (SQL real) e a **API pela rede**
(Express de verdade): autenticação, CSRF e a matriz de permissões por papel. Eles precisam de um banco descartável já migrado:

```bash
createdb conectfome_itest
DATABASE_URL=postgresql://conectfome:conectfome@localhost:5432/conectfome_itest npx prisma migrate deploy
INTEGRATION_DATABASE_URL=postgresql://conectfome:conectfome@localhost:5432/conectfome_itest npm run test:integration
```

Atenção: o teste de integração apaga (`TRUNCATE`) as tabelas do banco
indicado; nunca aponte para um banco com dados.

## Decisões conscientes (fora do escopo por opção, não por esquecimento)

- **Sem verificação de e-mail nem recuperação de senha por e-mail** —
  reduz a superfície de configuração (sem provedor de e-mail) sem
  comprometer a demonstração do fluxo principal.
- **Sem otimização de rota "de verdade"** — vizinho mais próximo e linha
  reta bastam para rotas curtas; um solver com ruas e janelas de tempo fica
  como evolução.
- **Sem upload de foto da doação** — o texto da descrição já é
  suficiente pro fluxo de casar/coletar; foto é uma melhoria de UX, não
  uma dependência funcional.
- **Sem cron de vencimento automático** — `VENCIDA` é uma ação manual
  (do doador ou do admin), não um job agendado; a data fica em `expiredAt`.
  Evita a complexidade
  operacional de um scheduler pra uma decisão que, na prática, alguém
  vai querer confirmar de qualquer forma.
- **Voluntários não têm login** — são geridos pelo admin, como no
  `Driver` do projeto de referência (PRODUCTION ERP); no mundo real,
  esse público tende a operar por telefone/WhatsApp, não por painel web.
- **Plataforma única, sem multi-tenant** — ConectaFome é uma rede só de
  doadores/receptores, não um SaaS com múltiplas organizações isoladas
  (diferente do ATHLO, de onde vem a fundação de auth).

## Créditos de arquitetura

Fundação de autenticação, estrutura de camadas e padrão de testes
adaptados do projeto **ATHLO**. Raciocínio de modelagem de logística
(veículo/motorista/romaneio) adaptado do **PRODUCTION ERP** — em ambos
os casos, o padrão foi reimplementado em Prisma/Express, não copiado
(os projetos de origem usam Java/Spring).
