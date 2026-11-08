const L = require('./lib')
const {
  fs, path, Document, Packer, Paragraph, TextRun, AlignmentType, TableOfContents,
  P, PN, H1, H2, H3, bullet, pageBreak, caption, table, kv, img, spacer, styles, numbering, footer, PAGE,
  FONT, GREEN, DARK, GRAY, Table, TableRow, WidthType, cell, CONTENT_W,
} = L

const M = require('./metrics.json')
const telasDir = path.join(__dirname, '..', 'telas')
const telasCatalog = fs.existsSync(path.join(telasDir, 'catalogo.json')) ? JSON.parse(fs.readFileSync(path.join(telasDir, 'catalogo.json'), 'utf8')) : []
const telaPorTitulo = (trecho) => telasCatalog.find((t) => t.title.toLowerCase().includes(trecho.toLowerCase()))
const NOME = 'ConectaFome'
const SUB = 'Plataforma de Doação e Redistribuição de Alimentos'

// tamanho natural de um PNG, para manter proporção
function size(file, w) {
  const b = fs.readFileSync(path.join(L.path.join(__dirname, '..', 'figuras'), file))
  const W = b.readUInt32BE(16)
  const H = b.readUInt32BE(20)
  return [w, Math.round((w * H) / W)]
}
const fig = (file, w) => img(file, ...size(file, w))

// ───────────────────────── CAPA ─────────────────────────
const c = (t, o = {}) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 300 },
    children: [new TextRun({ text: t, font: FONT, size: o.size ?? 24, bold: o.bold, color: o.color, allCaps: o.caps })],
  })

const capa = [
  c('CENTRO UNIVERSITÁRIO FACENS', { bold: true, size: 26, before: 400 }),
  c('Análise e Desenvolvimento de Sistemas', { size: 24 }),
  c('UPX2 – Usina de Projetos Experimentais II', { size: 24, after: 1800 }),
  c(NOME, { bold: true, size: 64, color: GREEN, after: 80 }),
  c(SUB, { size: 30, color: DARK, after: 240 }),
  c('Documentação completa do projeto', { size: 26, color: GRAY, after: 1700 }),
  c('João Albuquerque de Meneses (RA 252930)', { size: 22 }),
  c('Lucas Lima Santos (RA 263999)', { size: 22 }),
  c('Vitor Gimenez (RA 248707)', { size: 22, after: 300 }),
  c('Orientadora: Brenda Medina de Oliveira', { size: 22, after: 1100 }),
  c('Sorocaba/SP', { size: 22, after: 0 }),
  c('2026', { size: 22 }),
  pageBreak(),
]


// ───────────────────────── 1. INFORMAÇÕES ─────────────────────────
const s1 = [
  H1('1. Informações do Projeto'),
  kv([
    ['Título do projeto', `${NOME} – ${SUB}`],
    ['Nome anterior', 'DOA+ (nome usado nas primeiras versões desta documentação e nas personas)'],
    ['Instituição', 'Centro Universitário Facens – Sorocaba/SP'],
    ['Disciplina', 'UPX2 – Usina de Projetos Experimentais II'],
    ['Curso / semestre', 'Análise e Desenvolvimento de Sistemas – 2º semestre de 2026'],
    ['Orientadora', 'Brenda Medina de Oliveira'],
    ['Integrantes', ['João Albuquerque de Meneses – RA 252930', 'Lucas Lima Santos – RA 263999', 'Vitor Gimenez – RA 248707']],
    ['ODS relacionados', 'ODS 2 – Fome Zero e Agricultura Sustentável; ODS 12 – Consumo e Produção Responsáveis'],
    ['Código-fonte', 'github.com/hlima-dev/ConectaFome (monorepo: backend/ e frontend/)'],
  ]),
  spacer(),
]

// ───────────────────────── 2. INTRODUÇÃO ─────────────────────────
const s2 = [
  H1('2. Introdução'),
  P('O desperdício de alimentos é, ao mesmo tempo, um problema social, econômico e ambiental. O relatório Food Waste Index 2024, do Programa das Nações Unidas para o Meio Ambiente, estima que o mundo gerou cerca de 1,05 bilhão de toneladas de resíduos alimentares em 2022, das quais 631 milhões de toneladas vieram dos domicílios (UNEP, 2024). No Brasil, a Pesquisa Nacional por Amostra de Domicílios Contínua de 2024 registrou 18,9 milhões de domicílios (24,2% do total) com algum grau de insegurança alimentar (IBGE, 2025). Há, portanto, alimento sendo descartado em um polo da cadeia e falta de alimento no outro.'),
  P('O ConectaFome é uma plataforma web que aproxima esses dois polos. Estabelecimentos (doadores) registram os excedentes que ainda estão próprios para consumo, informando validade, janela de coleta e condição de armazenamento. Instituições e famílias (receptores) veem em um painel as oportunidades disponíveis, ordenadas por urgência, e reservam as que conseguem aproveitar. A administração acompanha o fluxo, reatribui doações quando necessário e organiza a coleta em rotas com veículo e voluntário, com mapa e ordem sugerida das paradas. Cada passo fica registrado em um histórico (quem fez e quando), e o sistema emite o comprovante da doação e relatórios do alimento efetivamente resgatado por mês, por doador e por receptor.'),
  P('A proposta se relaciona diretamente com o ODS 2 (Fome Zero), ao ampliar o acesso a alimentos, e com o ODS 12 (Consumo e Produção Responsáveis), ao reduzir perdas evitáveis. Este documento descreve o problema, o planejamento, o produto, as análises de usuário e de mercado e os limites do escopo do MVP.'),
]

// ───────────────────────── 3. OBJETIVOS ─────────────────────────
const s3 = [
  H1('3. Objetivos'),
  H2('3.1 Objetivo geral'),
  P('Desenvolver um sistema web responsivo que conecte doadores de alimentos a organizações e famílias receptoras cadastradas, organizando a identificação, a reserva, a coleta e a confirmação de entrega de alimentos que seriam descartados, e que disponibilize comprovantes e indicadores sobre o volume resgatado.'),
  H2('3.2 Objetivos específicos'),
  bullet('Permitir o cadastro e o gerenciamento de doadores (mercados, restaurantes, feiras) e de receptores (ONGs e famílias).'),
  bullet('Registrar as doações com categoria, descrição, quantidade estimada em quilogramas, validade, janela de coleta e condição de armazenamento.'),
  bullet('Oferecer ao receptor um painel de oportunidades ordenado por urgência, com reserva direta das doações.'),
  bullet('Sinalizar doações com prazo curto e notificar os envolvidos nos eventos relevantes do fluxo.'),
  bullet('Acompanhar cada doação por um ciclo de status rastreável (disponível, reservada, agendada, coletada, entregue, cancelada ou vencida) com histórico de quem executou cada ação.'),
  bullet('Organizar a coleta em rotas, com veículo, voluntário, mapa, ordem sugerida das paradas e verificação da capacidade do veículo.'),
  bullet('Registrar a quantidade realmente coletada, a confirmação de recebimento pelo receptor e emitir o comprovante da doação.'),
  bullet('Gerar relatórios de alimento resgatado por mês, por doador e por receptor, com taxas de resgate, perda e entrega.'),
  bullet('Garantir controle de acesso por papel (administrador, doador e receptor) e proteção básica dos dados dos usuários.'),
  spacer(),
]

// ───────────────────────── 4. JUSTIFICATIVA ─────────────────────────
const s4 = [
  H1('4. Justificativa'),
  P('Os dois públicos que o projeto atende têm necessidades complementares. Estabelecimentos precisam dar destino a excedentes antes do vencimento, e a doação costuma depender de contatos informais, grupos de mensagens e planilhas, o que atrasa a retirada e não deixa registro. Instituições sociais, por sua vez, não sabem com antecedência quando e onde haverá alimento e gastam combustível e tempo em deslocamentos mal planejados (ver Seção 10, Personas).'),
  P('Os números de contexto reforçam a relevância. O Food Waste Index 2024 aponta 79 kg de alimento desperdiçado por pessoa, por ano, nos domicílios em nível mundial; para o Brasil, a Embrapa reporta cerca de 94 kg por habitante, valor que vem de um estudo-piloto em cinco regiões do município do Rio de Janeiro e, portanto, não é uma estimativa nacional (EMBRAPA, 2024). Estimativas de volume nacional circulam entre 27 e 46 milhões de toneladas por ano, conforme a fonte e a metodologia, o que indica falta de consenso e não deve ser tratado como dado exato. Do lado da necessidade, a PNAD Contínua 2024 mostra que 24,2% dos domicílios brasileiros ainda convivem com algum grau de insegurança alimentar (IBGE, 2025).'),
  P('O ambiente legal também mudou. A Lei nº 14.016/2020, que autorizava a doação de excedentes e limitava a responsabilidade do doador, foi revogada pela Lei nº 15.224, de 30 de setembro de 2025, que institui a Política Nacional de Combate à Perda e ao Desperdício de Alimentos e cria o Selo Doador de Alimentos (BRASIL, 2025). A existência de um marco legal próprio e de um selo de reconhecimento reforça o interesse do doador em formalizar e documentar o que doa, que é justamente o que o relatório do sistema oferece. Os detalhes de responsabilidade do doador na nova lei devem ser conferidos no texto oficial antes de qualquer uso comercial do produto.'),
  P('É preciso reconhecer que a doação de excedentes já tem iniciativas consolidadas. O programa Mesa Brasil Sesc atua em Sorocaba, Votorantim e Araçoiaba da Serra desde maio de 2017 e, entre janeiro e setembro de 2018, distribuiu 88.762 kg de alimentos a 36 instituições, com 21 doadores cadastrados (SESC SÃO PAULO, 2018). O ConectaFome não pretende substituir esse tipo de programa: o diferencial proposto é uma ferramenta de código aberto, com rastreio de status por doação e relatório de impacto por doador e receptor, que pode servir a ONGs e coletivos menores ou operar em conjunto com redes existentes.'),
  P('Do ponto de vista acadêmico, o projeto integra análise de requisitos, modelagem de dados, desenvolvimento web full stack, segurança de aplicações, testes automatizados, implantação e gestão de projetos.'),
]

// ───────────────────────── 5. CRONOGRAMA ─────────────────────────
const s5 = [
  H1('5. Cronograma'),
  P('O projeto foi planejado para nove semanas. A coluna “Evidência” indica onde o resultado de cada etapa pode ser verificado.'),
  table(
    ['Etapa', 'Atividade', 'Prazo', 'Evidência'],
    [
      ['1', 'Levantamento do problema e definição da ideia', 'Semana 1', 'Seções 2 a 4 e mapa mental (Figura 2)'],
      ['2', 'Pesquisa e levantamento de requisitos', 'Semanas 1–2', 'Seção 8.2 (requisitos)'],
      ['3', 'Definição das personas e proposta de valor', 'Semana 2', 'Seções 10 e 11'],
      ['4', 'Modelagem do banco de dados e arquitetura', 'Semanas 2–3', 'backend/prisma/schema.prisma; Seções 8.3 e 8.4'],
      ['5', 'Protótipo e design das telas', 'Semanas 3–4', 'Protótipo no Figma; frontend/src/pages'],
      ['6', 'Autenticação e cadastros de doadores e receptores', 'Semanas 4–5', 'backend/src/services (Auth, Donor, Recipient)'],
      ['7', 'Doações: painel de oportunidades, reserva, histórico e notificações', 'Semanas 5–6', 'DonationService; frontend/src/pages/donations'],
      ['8', 'Rotas com mapa, comprovantes e relatórios', 'Semanas 6–7', 'PickupRouteService; ReportService; telas de logística e relatórios'],
      ['9', 'Integração, testes e correções', 'Semana 8', 'backend/tests; frontend/tests; .github/workflows/ci.yml'],
      ['10', 'Documentação, apresentação e entrega', 'Semana 9', 'Este documento e o artigo científico'],
    ],
    [850, 3200, 1250, 3771],
  ),
  spacer(),
]

// ───────────────────────── 6. METODOLOGIA ─────────────────────────
const s6 = [
  H1('6. Metodologia'),
  H2('6.1 Abordagem de desenvolvimento'),
  P('O projeto seguiu um desenvolvimento incremental com práticas ágeis (BECK et al., 2001). Primeiro foram levantados o problema, os usuários e os requisitos; depois, o modelo de dados e a arquitetura; em seguida, o sistema foi construído em fases curtas, cada uma entregando um módulo utilizável: autenticação e schema, cadastros, ciclo de vida das doações, logística e relatórios. Cada fase terminou em um commit próprio com testes, o que permitiu validar o módulo antes de depender dele.'),
  P('A organização das tarefas foi feita em um quadro Kanban no Trello, com colunas A fazer, Pendentes, Concluídos e Backlog/ideias, e com os cargos do projeto cadastrados como cartões (Figura 1).'),
  fig('trello.png', 460),
  caption('Figura 1 – Quadro do Trello da equipe (Code Wizards).'),
  H2('6.2 Ferramentas e tecnologias'),
  table(
    ['Camada', 'Tecnologia', 'Uso no projeto'],
    [
      ['Backend', 'Node.js 20, Express, TypeScript', 'API REST organizada em rotas, controllers e services'],
      ['Banco de dados', 'PostgreSQL 16 e Prisma ORM', 'Modelos e enumerações versionados por migração'],
      ['Mapas e geocodificação', 'Leaflet, OpenStreetMap e Nominatim', 'Mapa da rota, coordenadas dos endereços e distância estimada'],
      ['Validação', 'Zod', 'Validação de entrada nos controllers e das variáveis de ambiente'],
      ['Frontend', 'React, Vite, TypeScript, Tailwind CSS', 'Interface responsiva organizada por módulos'],
      ['Estado do servidor', 'TanStack Query e Axios', 'Hooks por domínio e chamadas à API'],
      ['Testes', 'Vitest e Testing Library', 'Testes unitários (Prisma simulado), de integração com PostgreSQL real e de componentes'],
      ['Integração contínua', 'GitHub Actions', 'Instala, audita dependências, executa os testes (inclusive de integração com banco) e compila backend e frontend'],
      ['Implantação', 'Render (API), Vercel (frontend), Supabase (PostgreSQL)', 'Arquivos render.yaml e vercel.json no repositório'],
      ['Verificação ponta a ponta', 'Playwright', 'Roteiro em navegador real que percorre o fluxo completo e captura as telas'],
      ['Gestão e design', 'Trello, Figma, Git/GitHub', 'Tarefas, protótipo e versionamento'],
    ],
    [1700, 3000, 4371],
  ),
  spacer(),
  H2('6.3 Qualidade e segurança'),
  bullet('**Autenticação:** JWT de acesso e de renovação em cookies httpOnly, com proteção CSRF por dupla submissão.'),
  bullet('**Força bruta:** a conta é bloqueada após 5 tentativas de senha incorretas em 15 minutos, e as mensagens de erro do login são genéricas para não revelar quais e-mails existem.'),
  bullet('**Autorização:** três papéis (ADMIN, DOADOR, RECEPTOR), aplicados nas rotas e, para dados de outros usuários, também dentro dos services.'),
  bullet('**Auditoria:** cada transição de estado da doação grava o usuário, a data e os estados de origem e destino.'),
  bullet('**Banco:** consultas pelo Prisma; a única consulta SQL direta (agregação mensal do relatório) usa parâmetros e não concatenação de texto.'),
  bullet('**Pipeline:** a integração contínua falha se houver vulnerabilidade alta ou crítica nas dependências do backend, se algum teste (unitário ou de integração) falhar ou se a compilação não passar.'),
  H2('6.4 Recursos e custos estimados'),
  P('O orçamento abaixo é uma estimativa feita pela equipe para um MVP de nove semanas. O esforço técnico é valorizado a preço de estágio/júnior apenas para fins de dimensionamento, pois se trata de projeto acadêmico. A configuração de deploy do repositório usa planos gratuitos de hospedagem; a linha de R$ 35,00/mês para o servidor foi mantida como previsão conservadora, caso o plano gratuito se mostre insuficiente.'),
  table(
    ['Item', 'Finalidade', 'Custo total (3 meses)'],
    [
      ['Registro de domínio', 'Domínio próprio (.com.br), R$ 40,00 por ano', 'R$ 40,00'],
      ['Hospedagem do frontend', 'Vercel (plano gratuito)', 'R$ 0,00'],
      ['Servidor da API', 'Render, previsão de R$ 35,00/mês', 'R$ 105,00'],
      ['Banco de dados em nuvem', 'PostgreSQL gerenciado (Supabase, plano gratuito)', 'R$ 0,00'],
      ['Ferramentas de trabalho e SSL', 'Figma, Trello, GitHub, certificado HTTPS', 'R$ 0,00'],
      ['Contingência', 'Reserva para imprevistos', 'R$ 100,00'],
      ['**Total de infraestrutura**', '', '**R$ 245,00**'],
    ],
    [2900, 4271, 1900],
  ),
  spacer(),
  table(
    ['Integrante / função', 'Horas (9 semanas)', 'Valor/hora', 'Valor estimado'],
    [
      ['João Albuquerque de Meneses (PO, gestão e requisitos)', '60 h', 'R$ 35,00', 'R$ 2.100,00'],
      ['Lucas Lima Santos (back-end, banco de dados e APIs)', '80 h', 'R$ 35,00', 'R$ 2.800,00'],
      ['Vitor Gimenez (front-end, UI/UX e testes)', '80 h', 'R$ 35,00', 'R$ 2.800,00'],
      ['**Total**', '**220 h**', '', '**R$ 7.700,00**'],
    ],
    [4271, 1600, 1500, 1700],
  ),
  PN('Custo total estimado do projeto: R$ 245,00 de desembolso direto + R$ 7.700,00 de esforço técnico = **R$ 7.945,00**.', { before: 120 }),
]

// ───────────────────────── 7. FUNÇÕES ─────────────────────────
const s7 = [
  H1('7. Descrição das Funções no Projeto'),
  table(
    ['Integrante', 'RA', 'Funções acumuladas'],
    [
      ['João Albuquerque de Meneses', '252930', 'Product Owner (PO), levantamento e organização de requisitos'],
      ['Lucas Lima Santos', '263999', 'Desenvolvedor back-end, banco de dados e integração do sistema'],
      ['Vitor Gimenez', '248707', 'Desenvolvedor front-end, UI/UX e apoio em testes funcionais'],
    ],
    [3000, 1100, 4971],
  ),
  spacer(),
  H3('Função 1 – Gestor do projeto / Product Owner'),
  P('Define o escopo, prioriza o backlog, organiza o Trello, acompanha as entregas e garante o alinhamento do produto com os objetivos e com os ODS.'),
  H3('Função 2 – Analista de requisitos'),
  P('Levanta as necessidades de doadores e receptores, modela os fluxos (em especial o ciclo de vida da doação) e documenta os requisitos funcionais.'),
  H3('Função 3 – Desenvolvedor front-end / UI/UX'),
  P('Prototipa e implementa as interfaces, cuida da responsividade e da usabilidade e mantém o frontend em React.'),
  H3('Função 4 – Desenvolvedor back-end / banco de dados'),
  P('Modela o banco relacional, constrói a API, implementa as regras de negócio e as validações e a segurança de acesso.'),
  H3('Função 5 – Engenheiro de testes / QA'),
  P('Escreve e executa os testes automatizados e os cenários funcionais, registra falhas e valida as correções.'),
  H3('Função 6 – DevOps, documentação e suporte'),
  P('Mantém o versionamento no GitHub, a integração contínua, a configuração de implantação e a documentação técnica.'),
]

// ───────────────────────── 8. DESENVOLVIMENTO ─────────────────────────
const s8 = [
  H1('8. Desenvolvimento do Projeto'),
  H2('8.1 Visão geral'),
  P('O mapa mental da Figura 2 resume a concepção do sistema: a proposição social e ambiental (ODS 2 e 12), o fluxo do sistema (cadastro de participantes, redistribuição dos alimentos, coleta e logística), as funcionalidades principais (gestão de cadastro, planejamento operacional, impacto e acompanhamento) e os benefícios esperados para a comunidade, os doadores e o meio ambiente.'),
  fig('mapa_mental.png', 600),
  caption('Figura 2 – Mapa mental do projeto “Doações e Sobra de Alimentos”.'),
  H2('8.2 Requisitos'),
  H3('Requisitos funcionais'),
  table(
    ['Código', 'Requisito', 'Quem usa'],
    [
      ['RF01', 'Cadastro público escolhendo o perfil de doador ou receptor; o usuário e o perfil são criados na mesma transação. O administrador não pode ser criado por cadastro público', 'Doador, receptor'],
      ['RF02', 'Login, logout e renovação de sessão, com bloqueio temporário após tentativas falhas', 'Todos'],
      ['RF03', 'Cadastro, edição e desativação (exclusão lógica) de doadores, com tipo, contato e endereço', 'Administrador; o doador edita o próprio'],
      ['RF04', 'Cadastro, edição e desativação de receptores, com tipo (ONG ou família) e número de pessoas atendidas', 'Administrador; o receptor edita o próprio'],
      ['RF05', 'Registro de doação: categoria, descrição, quantidade estimada em kg, validade, janela de coleta, condição de armazenamento (ambiente, refrigerado ou congelado), observações e declaração de que o alimento está próprio para consumo', 'Doador, administrador'],
      ['RF06', 'Edição da doação somente enquanto estiver disponível', 'Doador, administrador'],
      ['RF07', 'Painel de oportunidades: doações disponíveis, filtráveis por cidade e categoria e ordenadas por urgência', 'Receptor'],
      ['RF08', 'Reserva da doação pelo próprio receptor, com liberação da reserva (enquanto a doação não estiver em rota); casamento ou reatribuição pelo administrador', 'Receptor, administrador'],
      ['RF09', 'Cancelamento e marcação como vencida, a partir de disponível ou reservada', 'Doador, administrador'],
      ['RF10', 'Indicador de urgência (alerta de validade e de fim da janela de coleta) nas listagens e no painel', 'Todos'],
      ['RF11', 'Notificações internas nos eventos relevantes (nova doação, reserva, agendamento em rota, coleta, entrega e cancelamento)', 'Todos'],
      ['RF12', 'Cadastro de voluntários e de veículos (placa, modelo, capacidade em kg)', 'Administrador'],
      ['RF13', 'Criação de rota de coleta com veículo, voluntário e data; anexar e desanexar doações reservadas; iniciar; concluir; cancelar', 'Administrador'],
      ['RF14', 'Geocodificação dos endereços e mapa da rota, com ordem sugerida das paradas e distância estimada', 'Administrador'],
      ['RF15', 'Verificação da capacidade do veículo contra o peso estimado das doações da rota', 'Administrador'],
      ['RF16', 'Conclusão da rota registra a quantidade coletada de cada doação (padrão: a estimada, com possibilidade de correção)', 'Administrador'],
      ['RF17', 'Confirmação de recebimento pelo receptor, somente para doações já coletadas', 'Receptor, administrador'],
      ['RF18', 'Histórico de eventos de cada doação: ação, estado de origem e destino, usuário e data', 'Todos, conforme o acesso à doação'],
      ['RF19', 'Comprovante de doação, imprimível, com dados do doador, do receptor, da quantidade coletada e das datas', 'Doador, administrador'],
      ['RF20', 'Relatórios: kg resgatado por mês, por doador e por receptor, taxas de resgate, perda e entrega, pessoas atendidas, com filtro por período e exportação em CSV', 'Administrador'],
      ['RF21', 'Listagens com paginação e filtros e escopo de dados por papel', 'Todos'],
    ],
    [1050, 5850, 2171],
  ),
  spacer(),
  H3('Requisitos não funcionais'),
  bullet('**Segurança:** cookies httpOnly, CSRF, limitação de taxa, bloqueio de conta, senhas com hash bcrypt e variáveis de ambiente validadas na inicialização.'),
  bullet('**Usabilidade:** interface responsiva, com menu adaptado ao papel do usuário e diálogos de confirmação para ações irreversíveis.'),
  bullet('**Rastreabilidade:** toda mudança de estado de uma doação é registrada com o usuário responsável e a data.'),
  bullet('**Manutenibilidade:** TypeScript nas duas pontas, separação em camadas e testes automatizados nas regras de negócio.'),
  bullet('**Portabilidade:** configuração por variáveis de ambiente, execução local documentada no README e arquivos de implantação em nuvem.'),
  H2('8.3 Arquitetura'),
  P('O sistema é um monorepo com duas aplicações. O frontend em React consome a API REST por HTTPS, e o backend em Node/Express aplica, em ordem, os middlewares de autenticação, CSRF e limitação de taxa, direciona para controllers que validam a entrada com Zod, delega a regra de negócio aos services e acessa o PostgreSQL por meio do Prisma. A geocodificação dos endereços usa o serviço Nominatim do OpenStreetMap, chamado pelo backend ao salvar um endereço, e o mapa da rota é desenhado no frontend com Leaflet sobre as camadas do OpenStreetMap.'),
  fig('arquitetura.png', 560),
  caption('Figura 3 – Arquitetura do ConectaFome.'),
  H2('8.4 Modelo de dados'),
  table(
    ['Entidade', 'Papel no sistema', 'Campos principais'],
    [
      ['User', 'Conta de acesso', 'nome, e-mail único, senha (hash), papel, telefone, controle de tentativas e bloqueio'],
      ['Donor', 'Perfil de doador', 'nome, tipo, documento, contato, endereço, coordenadas, ativo; vinculado a um User'],
      ['Recipient', 'Perfil de receptor', 'nome, tipo (ONG/família), contato, endereço, coordenadas, pessoas atendidas, ativo'],
      ['Donation', 'Doação (entidade central)', 'categoria, descrição, kg estimado e coletado, validade, janela de coleta, condição de armazenamento, aceite do doador, status, receptor, rota e datas de reserva, coleta, confirmação, cancelamento e vencimento'],
      ['DonationEvent', 'Histórico da doação', 'doação, ação, estado de origem e destino, usuário e data'],
      ['Notification', 'Notificação interna', 'usuário destinatário, mensagem, doação relacionada, lida ou não, data'],
      ['PickupRoute', 'Rota de coleta', 'número sequencial, veículo, voluntário, status, data prevista, saída e conclusão'],
      ['Vehicle', 'Veículo', 'placa única, modelo, capacidade em kg'],
      ['Volunteer', 'Voluntário', 'nome, documento único, telefone, ativo'],
    ],
    [1700, 2300, 5071],
  ),
  PN('Enumerações: papel, tipo de doador, tipo de receptor, categoria de alimento, condição de armazenamento, status da doação e status da rota.', { before: 120 }),
  H2('8.5 Papéis e permissões'),
  table(
    ['Ação', 'Administrador', 'Doador', 'Receptor'],
    [
      ['Gerenciar doadores e receptores', 'Todos', 'Apenas o próprio cadastro', 'Apenas o próprio cadastro'],
      ['Registrar e editar doação', 'Em nome de qualquer doador', 'Apenas as próprias', 'Não'],
      ['Ver oportunidades e reservar', 'Sim (casa ou reatribui)', 'Não', 'Sim, para si'],
      ['Liberar uma reserva', 'Sim', 'Não', 'Apenas as próprias'],
      ['Cancelar / marcar vencida', 'Sim', 'Apenas as próprias', 'Não'],
      ['Confirmar recebimento', 'Sim', 'Não', 'Apenas as destinadas a ele'],
      ['Comprovante da doação', 'Todos', 'Apenas as próprias', 'Não'],
      ['Voluntários, veículos e rotas', 'Sim', 'Não', 'Não'],
      ['Relatórios e indicadores', 'Sim', 'Não', 'Não'],
    ],
    [3000, 2200, 1950, 1921],
  ),
  spacer(),
  H2('8.6 Ciclo de vida da doação'),
  P('O ciclo da doação é o eixo do sistema. Cada estado corresponde a uma ação distinta, e não a um único campo “concluído”, o que permite ao relatório separar o que foi resgatado do que foi entregue e do que se perdeu. Cancelamento e vencimento só são possíveis a partir de disponível ou reservada, e cada transição grava um evento no histórico com o usuário responsável.'),
  fig('ciclo_doacao.png', 580),
  caption('Figura 4 – Estados da doação e quem executa cada transição.'),
  P('O evento que conta como “resgatado” é a conclusão da rota (estado coletada): o relatório soma as doações coletadas e entregues, usando a quantidade efetivamente coletada. O estado vencida torna visível o que ainda se perde antes da coleta, em vez de escondê-lo.'),
  H2('8.7 Urgência e notificações'),
  P('O sistema calcula a urgência de cada doação disponível a partir do que vencer primeiro entre a validade e o fim da janela de coleta. Doações com menos de 24 horas são marcadas como urgentes e aparecem primeiro no painel do receptor. Os eventos do fluxo geram notificações internas, exibidas em um indicador no topo da interface, para que doador, receptor e administrador saibam o que mudou sem depender de mensagens externas.'),
  H2('8.8 Logística de coleta'),
  P('O administrador cria uma rota escolhendo veículo, voluntário e data, e anexa a ela doações já reservadas, que passam a agendadas. O sistema mostra as paradas em um mapa, sugere a ordem de visita pelo critério do vizinho mais próximo a partir do primeiro ponto e estima a distância total; trata-se de uma heurística e não de uma solução ótima. A soma do peso estimado das doações é comparada à capacidade do veículo, e a rota só pode ser iniciada se tiver ao menos uma doação. Ao concluí-la, o sistema, em uma única transação, marca todas as doações como coletadas e grava a data e a quantidade coletada. Uma rota ainda planejada pode ser cancelada, devolvendo suas doações ao estado reservada. Voluntários não têm login: são geridos pelo administrador, pois no contexto real esse público tende a operar por telefone ou mensagens.'),
  H2('8.9 Comprovantes e relatórios'),
  P('Para cada doação coletada ou entregue, o doador pode emitir um comprovante imprimível com os dados das partes, a quantidade coletada e as datas. O módulo de relatórios oferece o total de quilogramas resgatados por mês (com a contagem de doações), o ranking por doador e por receptor, as taxas de resgate, perda e entrega, o total de pessoas atendidas e um resumo para o painel do administrador. Os dados podem ser exportados em CSV.'),
  H2('8.10 Testes e implantação'),
  P(`O backend possui ${M.backendTests} testes automatizados em ${M.backendTestFiles} arquivos (${M.backendTestsPassed} aprovados na última medição, em ${M.generatedAt}), que cobrem as regras dos services e os middlewares de segurança. Além dos testes unitários com o Prisma simulado, há ${M.integrationTests ?? 'testes'} testes de integração contra um PostgreSQL real, que validam as consultas SQL dos relatórios, as transações de rota e a reserva simultânea. O frontend tem ${M.frontendTests} testes de componente, cobrindo as telas principais (formulário de doação, oportunidades, rota, comprovante, relatórios e painel). Parte desses testes de integração sobe a API de verdade e confere, pela rede, a autenticação, a proteção CSRF e a matriz de permissões por papel. Por fim, um roteiro em navegador real percorre o fluxo completo com doador, receptor e administrador e captura as ${telasCatalog.length || 49} telas do sistema (catálogo em anexo). Os testes e a compilação rodam a cada push na integração contínua.`),
  fig('testes_por_modulo.png', 440),
  caption('Figura 5 – Testes automatizados do backend por arquivo.'),
  P('A implantação está descrita por um blueprint do Render para a API (que executa migração e carga inicial ao subir) e por um arquivo de configuração da Vercel para o frontend, com o banco PostgreSQL externo, no Supabase.'),
  H2('8.11 Escopo e decisões de projeto'),
  P('Algumas funcionalidades foram deliberadamente deixadas fora do MVP. Registrá-las deixa claro o limite do que o sistema promete:'),
  table(
    ['Fora do escopo', 'Motivo / alternativa adotada'],
    [
      ['Notificações por e-mail, WhatsApp ou push', 'Evita depender de provedor externo; as notificações internas cobrem o fluxo'],
      ['Vencimento automático por tarefa agendada', 'O alerta de urgência torna o prazo visível; a decisão de marcar como vencida é de uma pessoa'],
      ['Otimização matemática de rotas', 'Usa-se heurística do vizinho mais próximo e distância em linha reta, suficiente para rotas curtas'],
      ['Verificação automática das condições sanitárias', 'As condições de armazenamento são declaradas pelo doador; o sistema não mede temperatura'],
      ['Foto da doação', 'Melhoria de usabilidade; a descrição basta para o fluxo'],
      ['Login e aplicativo para voluntários', 'Voluntários são geridos pelo administrador; app móvel consta em Estudos Futuros'],
      ['Verificação de e-mail e recuperação de senha', 'Reduz a superfície de configuração do MVP'],
      ['Página de perfil do usuário e de configurações', 'O cadastro pode ser alterado pela administração; uma tela de autoatendimento fica para uma próxima versão'],
      ['Exportação dos relatórios em PDF', 'A exportação é em CSV (abre no Excel); o comprovante de cada doação é imprimível e pode ser salvo em PDF pelo navegador'],
    ],
    [3600, 5471],
  ),
  spacer(),

  H2('8.12 Telas do sistema'),
  P('As telas abaixo foram capturadas com o sistema em funcionamento, por um roteiro automatizado que percorre o fluxo completo (dados de demonstração). O catálogo com todas as telas segue em anexo. No mapa da rota, o fundo cinza se deve ao ambiente de captura não ter acesso à internet; em uso normal o mapa exibe as ruas do OpenStreetMap.'),
  ...[
    ['Pagina inicial', 'Página inicial pública', 330],
    ['Dashboard apos', 'Dashboard administrativo', 520],
    ['Painel de oportunidades', 'Painel de oportunidades do receptor', 330],
    ['Rota com mapa', 'Rota de coleta com mapa, ordem das paradas e carga do veículo', 330],
    ['Doacao entregue com historico', 'Doação entregue, com o histórico de cada ação', 330],
    ['Comprovante de doacao', 'Comprovante de doação', 330],
    ['Relatorios', 'Relatórios e indicadores do período', 330],
    ['Dashboard do administrador', 'Versão para celular (dashboard)', 220],
  ].flatMap(([trecho, legenda, largura], i) => {
    const t = telaPorTitulo(trecho)
    if (!t) return []
    const b = fs.readFileSync(path.join(telasDir, t.file))
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
    const maxH = 560
    const k = Math.min(1, largura / w, maxH / h)
    return [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true, children: [new L.ImageRun({ type: 'png', data: b, transformation: { width: Math.round(w * k), height: Math.round(h * k) } })] }),
      caption(`Tela ${i + 1} – ${legenda}.`),
    ]
  }),
]

// ───────────────────────── 9. RESULTADOS ESPERADOS ─────────────────────────
const s9 = [
  H1('9. Resultados Esperados'),
  H2('9.1 Resultados do MVP'),
  bullet('Um sistema funcional para cadastro, oferta e reserva de doações, coleta em rota com mapa e confirmação de recebimento.'),
  bullet('Rastreabilidade do ciclo de cada doação, com histórico de quem fez o quê e separação entre o que foi resgatado, entregue, cancelado e vencido.'),
  bullet('Comprovante de doação e relatório mensal de alimento resgatado, utilizáveis em prestação de contas e em relatórios de responsabilidade social do doador.'),
  bullet('Redução do tempo entre o registro da doação e a coleta, pela visibilidade da urgência e pela reserva direta pelo receptor.'),
  bullet('Uma base de código testada e implantável que possa ser expandida para mais tipos de doadores e receptores.'),
  H2('9.2 Indicadores de acompanhamento no piloto'),
  P('Os indicadores abaixo são calculados pelo próprio sistema e devem ser medidos no piloto. As metas do piloto estão definidas na Seção 13.'),
  table(
    ['Indicador', 'Como o sistema calcula', 'ODS'],
    [
      ['Quilogramas resgatados por mês', 'Soma da quantidade coletada das doações coletadas e entregues, por mês de coleta', '2 e 12'],
      ['Taxa de resgate', 'Doações coletadas ou entregues ÷ total de doações registradas', '12'],
      ['Perda antes da coleta', 'Doações vencidas ÷ total de doações registradas', '12'],
      ['Taxa de entrega confirmada', 'Doações entregues ÷ doações coletadas', '2'],
      ['Tempo até a coleta', 'Intervalo entre o registro da doação e a coleta, obtido do histórico de eventos', '12'],
      ['Pessoas atendidas e instituições ativas', 'Soma das pessoas atendidas pelos receptores com doação entregue; contagem de cadastros ativos', '2'],
    ],
    [2600, 5171, 1300],
  ),
  spacer(),
]

// ───────────────────────── 10. PERSONAS ─────────────────────────
const persona = (titulo, rows) => [H3(titulo), kv(rows), spacer()]
const s10 = [
  H1('10. Persona'),
  P('As personas de referência do projeto representam os três papéis do sistema: o doador, o receptor e o administrador que coordena a operação. Os nomes são fictícios. Elas orientaram a definição dos requisitos da Seção 8.2.'),
  ...persona('Persona 1 – Doador: Mariana Oliveira, 34 anos', [
    ['Perfil', 'Gerente de operações de um supermercado de médio porte em Sorocaba/SP. Lida diariamente com produtos próximos da validade ou com embalagem avariada, ainda próprios para consumo.'],
    ['Objetivos', ['Reduzir o descarte e o prejuízo associado.', 'Encontrar entidades sociais confiáveis para retirada ágil.', 'Obter relatórios de doação para prestação de contas e responsabilidade social.']],
    ['Dores', ['Falta de tempo para contatar ONGs antes do vencimento do lote.', 'Incerteza sobre o comparecimento do receptor no horário combinado.', 'Ausência de rastreabilidade e de comprovante das doações.', 'Risco sanitário quando a retirada atrasa.']],
    ['Necessidades', ['Cadastro rápido do lote (descrição, quantidade, data limite).', 'Agendamento confiável, com identificação de quem retira.', 'Histórico centralizado e relatório mensal do volume doado.']],
    ['Frase', '“Descartar comida em bom estado é revoltante, mas nosso time não tem tempo para negociar coletas pelo WhatsApp todo dia.”'],
  ]),
  ...persona('Persona 2 – Receptor: Carlos Mendes, 42 anos', [
    ['Perfil', 'Coordenador de uma ONG em Votorantim/SP que atende mais de 120 famílias em vulnerabilidade e depende de doações para cestas e refeições comunitárias. Possui um único veículo.'],
    ['Objetivos', ['Garantir fluxo contínuo e diversificado de alimentos.', 'Otimizar o uso do único veículo com coletas planejadas.', 'Ampliar a rede de doadores na região.']],
    ['Dores', ['Falta de previsibilidade de quando e onde haverá excedente.', 'Gasto de combustível com rotas desorganizadas.', 'Receber lotes com prazo muito curto sem aviso prévio.', 'Comunicação fragmentada em grupos de mensagens.']],
    ['Necessidades', ['Ver as oportunidades abertas por proximidade e saber quando serão coletadas.', 'Alertas de validade e prioridade.', 'Coletas agrupadas para planejar o deslocamento.']],
    ['Frase', '“Muitas vezes rodamos a cidade inteira sem saber ao certo se o lote ainda está disponível ou se chegaremos a tempo.”'],
  ]),
  ...persona('Persona 3 – Administradora: Renata Souza, 29 anos', [
    ['Perfil', 'Coordenadora de operações do projeto parceiro que opera a plataforma. É quem cadastra voluntários e veículos, casa as doações com os receptores e monta as rotas.'],
    ['Objetivos', ['Casar rapidamente cada doação com o receptor que consegue usá-la antes do vencimento.', 'Montar rotas que cabem no veículo e no tempo do voluntário.', 'Mostrar resultados a doadores e apoiadores.']],
    ['Dores', ['Depender de mensagens para saber o que está disponível.', 'Não saber, na hora de montar a rota, quanto a carga pesa em relação ao veículo.', 'Preparar relatórios manualmente.']],
    ['Necessidades', ['Lista de doações disponíveis com validade, janela de coleta e urgência.', 'Mapa da rota, capacidade do veículo e status de cada doação anexada.', 'Relatório mensal pronto e exportável.']],
    ['Observação', 'É quem executa os passos de maior valor operacional da coordenação: reatribuir doações, montar rotas e acompanhar os indicadores.'],
  ]),
  PN('**Conclusão de design:** o sistema responde às dores de velocidade e formalização da Mariana (cadastro rápido, histórico e comprovante) e às de previsibilidade e logística do Carlos (painel de oportunidades, alertas de urgência e rotas com mapa), e dá à Renata a visão operacional de que precisa para coordenar o fluxo.'),
]

// ───────────────────────── 11. CANVAS DE PROPOSTA DE VALOR ─────────────────────────
const vp = (titulo, perfil, mapa) => [
  H3(titulo),
  table(
    ['Perfil do cliente', 'Mapa de valor'],
    [
      [['**Tarefas do cliente**', ...perfil.tarefas.map((t) => '• ' + t)], ['**Produtos e serviços**', ...mapa.produtos.map((t) => '• ' + t)]],
      [['**Dores**', ...perfil.dores.map((t) => '• ' + t)], ['**Aliviadores de dor**', ...mapa.alivio.map((t) => '• ' + t)]],
      [['**Ganhos esperados**', ...perfil.ganhos.map((t) => '• ' + t)], ['**Criadores de ganho**', ...mapa.ganho.map((t) => '• ' + t)]],
    ],
    [4535, 4536],
  ),
  spacer(),
]
const s11 = [
  H1('11. Canvas de Proposta de Valor'),
  P('O canvas segue a estrutura de Osterwalder et al. (2014): à esquerda, o perfil do cliente (tarefas, dores e ganhos); à direita, o mapa de valor (produtos e serviços, aliviadores de dor e criadores de ganho). Foram feitos dois canvas, um para cada segmento.'),
  ...vp(
    'Segmento 1 – Doadores (mercados, restaurantes, feiras)',
    {
      tarefas: ['Dar destino aos excedentes antes do vencimento', 'Comprovar o que foi doado', 'Manter a rotina da loja sem esforço extra'],
      dores: ['Falta de tempo para negociar coletas', 'Retirada que atrasa ou não acontece', 'Sem comprovante nem histórico', 'Risco sanitário por atraso'],
      ganhos: ['Menos descarte e menos prejuízo', 'Imagem de responsabilidade social', 'Relatório para prestação de contas'],
    },
    {
      produtos: ['Cadastro rápido de doação com validade e janela de coleta', 'Acompanhamento do status até a entrega', 'Relatório de kg resgatado por mês'],
      alivio: ['A administração casa e roteiriza, o doador só registra', 'Janela de coleta definida no cadastro', 'Histórico de todas as doações'],
      ganho: ['Número de kg resgatados por mês', 'Visibilidade do que ainda se perde (vencidas)', 'Comprovante e histórico, úteis para o Selo Doador de Alimentos'],
    },
  ),
  ...vp(
    'Segmento 2 – Receptores (ONGs e famílias)',
    {
      tarefas: ['Obter alimento para as pessoas atendidas', 'Planejar o transporte', 'Confirmar o que recebeu'],
      dores: ['Não saber quando haverá doação', 'Rotas desorganizadas e combustível caro', 'Prazos muito curtos sem aviso', 'Comunicação dispersa'],
      ganhos: ['Fluxo mais regular de alimentos', 'Coletas planejadas', 'Rede maior de doadores'],
    },
    {
      produtos: ['Cadastro único da instituição', 'Painel de oportunidades com reserva direta', 'Confirmação de recebimento'],
      alivio: ['Urgência visível em cada doação', 'Coleta feita por voluntário e veículo da rota', 'Registro centralizado'],
      ganho: ['Histórico do que recebeu', 'Relatório por receptor', 'Previsibilidade: painel de oportunidades e alertas de urgência'],
    },
  ),
  PN('**Proposta de valor:** uma plataforma que simplifica a ligação entre quem tem alimento excedente e quem pode usá-lo, centralizando doações, reservas, rotas de coleta e indicadores de impacto.'),
]

// ───────────────────────── 12. LEAN CANVAS ─────────────────────────
const lc = (title, items, w) =>
  cell([`**${title}**`, ...items.map((i) => '• ' + i)], w, { size: 18, valign: 'top' })
const W5 = [1815, 1814, 1814, 1814, 1814]
function leanTable() {
  const rows = [
    new TableRow({
      cantSplit: true,
      children: [
        lc('2. Problema', ['Alimento próprio para consumo é descartado', 'Doadores não encontram receptor a tempo', 'Coordenação por mensagens e planilhas', 'Sem rastreabilidade nem comprovante'], W5[0]),
        lc('4. Solução', ['Cadastro de doadores e receptores', 'Doação com validade e janela', 'Reserva, rota com mapa e confirmação', 'Comprovante e relatório de kg resgatado'], W5[1]),
        lc('3. Proposta única de valor', ['Do cadastro à coleta em um só fluxo, com relatório de impacto por doador e receptor'], W5[2]),
        lc('9. Vantagem competitiva', ['Ciclo rastreável com histórico', 'Código aberto e de baixo custo', 'Integra doação, logística e impacto'], W5[3]),
        lc('1. Segmentos de clientes', ['Doadores: mercados, restaurantes, padarias e feiras', 'Receptores: ONGs, cozinhas comunitárias, famílias'], W5[4]),
      ],
    }),
    new TableRow({
      cantSplit: true,
      children: [
        lc('Alternativas existentes', ['Grupos de mensagens', 'Contato direto', 'Programas como o Mesa Brasil Sesc'], W5[0]),
        lc('8. Métricas-chave', ['kg resgatados por mês', 'Doações coletadas e entregues', 'Taxa de vencimento', 'Doadores e receptores ativos'], W5[1]),
        lc('Conceito de alto nível', ['“Um painel de controle para a doação de sobras de alimentos”'], W5[2]),
        lc('5. Canais', ['Aplicação web responsiva', 'Parcerias com ONGs e associações comerciais', 'Divulgação direta aos estabelecimentos'], W5[3]),
        lc('Primeiros adotantes', ['ONG e poucos estabelecimentos de Sorocaba/Votorantim, no piloto'], W5[4]),
      ],
    }),
  ]
  const bottom = new TableRow({
    cantSplit: true,
    children: [
      cell(['**7. Estrutura de custos**', '• Hospedagem da API, banco e domínio (Seção 6.4)', '• Manutenção e suporte', '• Tempo de operação da coordenação'], W5[0] + W5[1] + W5[2], { size: 18, span: 3 }),
      cell(['**6. Fontes de receita**', '• O MVP acadêmico não cobra', '• Hipóteses a validar: planos para redes e associações, convênios e patrocínio institucional'], W5[3] + W5[4], { size: 18, span: 2 }),
    ],
  })
  return new Table({ width: { size: 9071, type: WidthType.DXA }, columnWidths: W5, rows: [...rows, bottom] })
}
const s12 = [
  H1('12. Lean Canvas'),
  P('O Lean Canvas (MAURYA, 2012) organiza o modelo de negócio em nove blocos, numerados abaixo na ordem sugerida de preenchimento.'),
  leanTable(),
  spacer(),
  P('**Ponto fraco do modelo:** a receita é a parte menos validada. Receptores não têm como pagar, e a disposição de doadores a pagar por uma ferramenta que, para eles, economiza pouco tempo e evita pouco custo ainda não foi testada. Enquanto isso não for verificado em campo, o caminho mais realista é o financiamento institucional (convênios, patrocínio, parcerias com associações comerciais).', { indent: false }),
]

// ───────────────────────── 13. TAM SAM SOM ─────────────────────────
const s13 = [
  H1('13. Estudo de Mercado (TAM, SAM, SOM)'),
  P('O mercado do ConectaFome é de dois lados: unidades que geram excedente (doadores) e pessoas e instituições que precisam de alimento (receptores). Como o produto não cobra no MVP, os valores a seguir medem o **tamanho do público potencial em unidades**, e não receita. A estimativa é intencionalmente simples e as hipóteses estão explícitas para que possam ser corrigidas.'),
  H2('13.1 Lado doador'),
  table(
    ['Nível', 'Cálculo', 'Valor'],
    [
      ['TAM', 'Lojas do varejo alimentar no Brasil em 2024: 424.120 (ABRAS/NielsenIQ) + empresas do setor de alimentação fora do lar: cerca de 1,35 milhão (Abrasel, nov. 2024)', '≈ 1,77 milhão'],
      ['SAM', 'TAM × participação de Sorocaba na população do país (723.682 ÷ 203.080.756 = 0,356%)', '≈ 6.300'],
      ['SOM', 'Meta do piloto de 6 meses, definida pela equipe', '10 doadores'],
    ],
    [1000, 6271, 1800],
  ),
  PN('O volume esperado do piloto tem como referência o Mesa Brasil Sesc Sorocaba: 88.762 kg para 21 doadores entre janeiro e setembro de 2018 equivalem a cerca de 470 kg por doador por mês. Com 10 doadores nesse nível, a ordem de grandeza seria de 4,7 toneladas por mês, ou cerca de 28 toneladas no piloto de seis meses. É uma referência de comparação, não uma previsão.', { before: 120 }),
  H2('13.2 Lado receptor'),
  table(
    ['Nível', 'Cálculo', 'Valor'],
    [
      ['TAM', 'Domicílios brasileiros com algum grau de insegurança alimentar em 2024 (24,2% de 78,3 milhões)', '≈ 18,9 milhões'],
      ['SAM', 'TAM × 0,356% (participação de Sorocaba na população)', '≈ 67.500 domicílios'],
      ['SOM', 'Meta do piloto: 5 instituições receptoras (ONGs) que atendam essas famílias', '5 receptores'],
    ],
    [1000, 6271, 1800],
  ),
  spacer(),
  fig('tam_sam_som.png', 560),
  caption('Figura 6 – TAM, SAM e SOM do lado doador.'),
  H2('13.3 Limites desta estimativa'),
  bullet('A proporção populacional é um atalho. Sorocaba tem PIB per capita acima da média nacional (cerca de R$ 81,3 mil em 2023), de modo que a insegurança alimentar local tende a ser **menor** que a média e o SAM de receptores está provavelmente superestimado.'),
  bullet('O número de lojas da ABRAS inclui formatos pequenos (minimercados, conveniência, hortifrútis), e as 1,35 milhão de empresas da Abrasel incluem cerca de 660 mil MEIs e contam empresas, não pontos físicos. Nem toda unidade gera excedente doável em volume relevante, nem aceitaria usar a plataforma.'),
  bullet('A contagem real por município deve vir do Cadastro Central de Empresas do IBGE (SIDRA), filtrando Sorocaba, a divisão 47 (varejo de alimentos) e a divisão 56 (alimentação) da CNAE. O resultado dessa consulta deve substituir a estimativa proporcional do SAM antes de qualquer apresentação externa.'),
  bullet('O SOM é uma meta e não resultado de pesquisa de campo. Ele depende de relacionamento direto com os estabelecimentos e deve ser revisto após as primeiras conversas.'),
  bullet('As fontes foram consultadas por meio de publicações da imprensa e de páginas institucionais; os números devem ser conferidos nas fontes primárias antes de uma versão final.'),
]

// ───────────────────────── 14. CONCLUSÃO ─────────────────────────
const s14 = [
  H1('14. Conclusão'),
  P('O ConectaFome entrega um fluxo completo e rastreável para a redistribuição de alimentos: cadastro de doadores e receptores, oferta de doações com validade e condição de armazenamento, painel de oportunidades com reserva pelo receptor, rotas de coleta com mapa e verificação de capacidade, confirmação de recebimento, comprovantes e relatórios de alimento resgatado. A modelagem do ciclo de vida da doação como uma sequência de estados distintos, cada um com seu responsável e seu registro no histórico, é a decisão central e dá ao indicador de impacto um significado verificável.'),
  P('O escopo do MVP tem limites assumidos: a ordem das paradas segue uma heurística e não uma solução ótima, as condições sanitárias são declaradas pelo doador e não medidas, as notificações são internas e o vencimento é decidido por uma pessoa. A iniciativa também não está sozinha: programas como o Mesa Brasil Sesc já operam na região, de modo que a validação com doadores e ONGs reais é o passo que indicará se o ConectaFome funciona como complemento, alternativa ou ferramenta para organizações menores.'),
  P('Do ponto de vista acadêmico, o projeto cumpriu o objetivo de integrar levantamento de requisitos, modelagem, desenvolvimento full stack, segurança, testes automatizados e implantação em um produto coerente com os ODS 2 e 12.'),
]

// ───────────────────────── 15. ESTUDOS FUTUROS ─────────────────────────
const s15 = [
  H1('15. Estudos Futuros'),
  bullet('**Validação em campo:** piloto com doadores e ONGs de Sorocaba e Votorantim, medindo tempo até a coleta, taxa de vencimento e esforço de registro, e levantamento do número real de estabelecimentos no CEMPRE/IBGE para corrigir o SAM.'),
  bullet('**Aplicativo móvel** para voluntários e receptores, com login de voluntários e registro da coleta em campo.'),
  bullet('**Notificações externas** por e-mail, push ou WhatsApp.'),
  bullet('**Roteirização otimizada** com serviço de rotas em tempo real e problema do caixeiro viajante com janelas de tempo.'),
  bullet('**Vencimento automático** por tarefa agendada e foto da doação.'),
  bullet('**Controle sanitário:** registro de temperatura e integração com a vigilância sanitária local.'),
  bullet('**Sistema de reputação** e avaliação de confiabilidade entre doadores e receptores.'),
  bullet('**Recomendação de combinações** entre doadores e receptores com base em validade, distância e capacidade, após acumular dados reais.'),
  bullet('**Integração com sistemas de estoque** de estabelecimentos parceiros e geração de certificados ESG.'),
]

// ───────────────────────── 16. REFERÊNCIAS ─────────────────────────
const ref = (t) => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 160, line: 276 }, children: L.runs(t, { size: 22 }) })
const s16 = [
  H1('16. Referências Bibliográficas'),
  ref('ASSOCIAÇÃO BRASILEIRA DE SUPERMERCADOS (ABRAS). **Ranking ABRAS 2025**: dados do setor supermercadista em 2024 (424.120 lojas; faturamento de R$ 1,067 trilhão). São Paulo: ABRAS, 2025. Dados consultados em publicação da imprensa especializada.'),
  ref('ASSOCIAÇÃO BRASILEIRA DE BARES E RESTAURANTES (ABRASEL). **Dados do setor de alimentação fora do lar**: cerca de 1,35 milhão de empresas, nov. 2024. Consultado em: MERCADO & CONSUMO. Em 12 meses, Brasil registra mais de 148 mil novas empresas no setor de foodservice. 8 jan. 2025.'),
  ref('BECK, Kent et al. **Manifesto para o Desenvolvimento Ágil de Software**. 2001. Disponível em: agilemanifesto.org/iso/ptbr. Acesso em: 29 out. 2026.'),
  ref('BRASIL. **Lei nº 14.016, de 23 de junho de 2020**. Dispõe sobre o combate ao desperdício de alimentos e a doação de excedentes de alimentos para o consumo humano (revogada pela Lei nº 15.224/2025). Brasília, DF: Presidência da República, 2020.'),
  ref('BRASIL. **Lei nº 15.224, de 30 de setembro de 2025**. Institui a Política Nacional de Combate à Perda e ao Desperdício de Alimentos e o Selo Doador de Alimentos, e revoga a Lei nº 14.016/2020. Brasília, DF: Presidência da República, 2025.'),
  ref('EMPRESA BRASILEIRA DE PESQUISA AGROPECUÁRIA (EMBRAPA). **Mundo desperdiça mais de 1 bilhão de refeições por dia, segundo a ONU**. Brasília, DF: Embrapa, 27 mar. 2024. Disponível em: embrapa.br. Acesso em: 29 out. 2026.'),
  ref('FOOD AND AGRICULTURE ORGANIZATION OF THE UNITED NATIONS (FAO). GUSTAVSSON, J. et al. **Global food losses and food waste**: extent, causes and prevention. Rome: FAO, 2011.'),
  ref('HEVNER, Alan R. et al. Design science in information systems research. **MIS Quarterly**, v. 28, n. 1, p. 75-105, 2004.'),
  ref('INSTITUTO BRASILEIRO DE GEOGRAFIA E ESTATÍSTICA (IBGE). **Pesquisa Nacional por Amostra de Domicílios Contínua: Segurança Alimentar 2024**. Rio de Janeiro: IBGE, 2025. Disponível em: agenciadenoticias.ibge.gov.br. Acesso em: 29 out. 2026.'),
  ref('INSTITUTO BRASILEIRO DE GEOGRAFIA E ESTATÍSTICA (IBGE). **Censo Demográfico 2022** e **Cidades e Estados: Sorocaba**. Rio de Janeiro: IBGE, 2023. Disponível em: ibge.gov.br/cidades-e-estados/sp/sorocaba.html. Acesso em: 29 out. 2026.'),
  ref('MAURYA, Ash. **Running Lean**: iterate from Plan A to a plan that works. 2. ed. Sebastopol: O’Reilly Media, 2012.'),
  ref('ORGANIZAÇÃO DAS NAÇÕES UNIDAS (ONU). **Transformando nosso mundo**: a Agenda 2030 para o Desenvolvimento Sustentável. ODS 2 – Fome Zero e Agricultura Sustentável; ODS 12 – Consumo e Produção Responsáveis. 2015.'),
  ref('OSTERWALDER, Alexander; PIGNEUR, Yves; BERNARDA, Gregory; SMITH, Alan. **Value Proposition Design**: how to create products and services customers want. Hoboken: Wiley, 2014.'),
  ref('SERVIÇO SOCIAL DO COMÉRCIO – SESC SÃO PAULO. **Mesa Brasil comemora resultados de 2018 no Sesc Sorocaba**. São Paulo: Sesc SP, 9 nov. 2018. Disponível em: portal.sescsp.org.br. Acesso em: 29 out. 2026.'),
  ref('SOMMERVILLE, Ian. **Engenharia de software**. 10. ed. São Paulo: Pearson, 2018.'),
  ref('UNITED NATIONS ENVIRONMENT PROGRAMME (UNEP). **Food Waste Index Report 2024**: think eat save – tracking progress to halve global food waste. Nairobi: UNEP, 2024. Disponível em: unep.org. Acesso em: 29 out. 2026.'),
]

const { Tab, TabStopType, LeaderType } = require('docx')
const pages = fs.existsSync(path.join(__dirname, 'toc.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'toc.json'), 'utf8')) : {}
const sumario = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'SUMÁRIO', bold: true, size: 28, font: FONT, color: GREEN })] }),
  ...L.headings.map((h) =>
    new Paragraph({
      spacing: { after: h.level === 1 ? 80 : 40, before: h.level === 1 ? 100 : 0, line: 276 },
      indent: { left: h.level === 1 ? 0 : 400 },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }],
      children: [
        new TextRun({ text: h.text, font: FONT, size: h.level === 1 ? 22 : 20, bold: h.level === 1 }),
        new TextRun({ children: [new Tab(), String(pages[h.text] ?? '')], font: FONT, size: h.level === 1 ? 22 : 20 }),
      ],
    }),
  ),
  pageBreak(),
]

const doc = new Document({
  creator: 'Equipe ConectaFome',
  title: `${NOME} – Documentação completa`,
  styles,
  numbering,
  sections: [
    { properties: { page: PAGE }, children: capa },
    {
      properties: { page: PAGE },
      footers: { default: footer(`${NOME} · Documentação`) },
      children: [
        ...sumario, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6, ...s7, ...s8, ...s9, ...s10, ...s11, ...s12, ...s13, ...s14, ...s15, ...s16,
      ],
    },
  ],
})

if (process.env.DUMP) fs.writeFileSync(path.join(__dirname, 'headings.json'), JSON.stringify(L.headings))
Packer.toBuffer(doc).then((b) => {
  const out = path.join(__dirname, '..', 'DOCUMENTACAO_CONECTAFOME.docx')
  fs.writeFileSync(out, b)
  console.log('ok', out, b.length)
})
