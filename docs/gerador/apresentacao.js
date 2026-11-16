// Documento de apoio à apresentação: curto, direto, com o que a banca costuma perguntar.
const L = require('./lib')
const { fs, path, Document, Packer, Paragraph, TextRun, AlignmentType, P, PN, H1, H2, bullet, table, kv, styles, numbering, footer, PAGE, FONT, GREEN, GRAY, DARK, spacer } = L

const p = (t, o = {}) => P(t, { indent: false, size: 22, line: 312, after: 100, align: AlignmentType.LEFT, ...o })
const b = (t) => L.bullet(t, { size: 22, line: 300 })
const c = (t, o = {}) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after ?? 100, before: o.before ?? 0 }, children: [new TextRun({ text: t, font: FONT, size: o.size ?? 24, bold: o.bold, color: o.color })] })

const NOME = 'ConectaFome'
const W = 9071

const capa = [
  c('CENTRO UNIVERSITÁRIO FACENS · UPX2', { size: 20, color: GRAY, before: 200 }),
  c(NOME, { size: 64, bold: true, color: GREEN, before: 200, after: 40 }),
  c('Conectando quem doa com quem precisa', { size: 28, color: DARK, after: 200 }),
  c('Documento de apoio à apresentação do projeto', { size: 22, color: GRAY, after: 260 }),
  kv([
    ['Sistema no ar', 'https://conecta-fome.vercel.app'],
    ['Código-fonte', 'github.com/hlima-dev/ConectaFome'],
    ['Equipe', ['João Albuquerque de Meneses (RA 252930)', 'Lucas Lima Santos (RA 263999)', 'Vitor Gimenez (RA 248707)']],
    ['Orientadora', 'Brenda Medina de Oliveira'],
    ['Curso', 'Análise e Desenvolvimento de Sistemas · Sorocaba/SP · 2026'],
  ]),
  spacer(160),
  L.H1('Resumo em uma frase'),
  p('Uma plataforma web que liga **mercados, restaurantes e feiras** que têm alimento sobrando a **ONGs e famílias** que precisam dele, organizando reserva, coleta, entrega e comprovante, com cada passo registrado.'),
]

const s1 = [
  H1('1. O problema e o objetivo'),
  p('**O problema.** Em um polo da cadeia, alimento próprio para consumo vai para o lixo porque o estabelecimento não tem tempo nem meio de destiná-lo antes de vencer. No outro polo, instituições e famílias passam falta. A ponte entre os dois hoje costuma ser WhatsApp, ligação e planilha: não há aviso de urgência, nem garantia de que alguém vai buscar, nem registro do que foi doado.'),
  table(['Número', 'O que mostra', 'Fonte'], [
    ['24,2%', 'dos domicílios brasileiros (18,9 milhões) convivem com algum grau de insegurança alimentar', 'IBGE, PNAD Contínua 2024'],
    ['1,05 bilhão de t', 'de alimentos viraram resíduo no mundo em 2022 (631 milhões de t vieram dos domicílios)', 'UNEP, Food Waste Index 2024'],
    ['ODS 2 e ODS 12', 'Fome Zero; Consumo e Produção Responsáveis: os dois objetivos que o projeto atende', 'ONU'],
  ], [1700, 5071, 2300], { size: 19 }),
  spacer(80),
  p('**Principal objetivo.** Desenvolver um sistema web que conecte doadores a receptores cadastrados e organize identificação, reserva, coleta e confirmação de entrega do alimento que seria descartado, com **comprovantes e indicadores** do volume realmente resgatado.'),
  p('**Para quem.** Doadores (mercados, restaurantes, feiras), receptores (ONGs e famílias) e a administração do sistema, que coordena a operação.'),
]

const s2 = [
  H1('2. Como surgiu a ideia'),
  p('A ideia nasceu na disciplina UPX2, a partir de uma pergunta simples: **por que há comida sobrando de um lado e fome do outro, se os dois lados estão na mesma cidade?** Partimos de Sorocaba e Votorantim, onde já existe o programa Mesa Brasil Sesc (que distribuiu 88.762 kg entre janeiro e setembro de 2018, com 21 doadores e 36 instituições), e perguntamos o que faltaria para uma ONG pequena ou um comércio de bairro participarem sem depender de um programa grande.'),
  p('Para entender os dois lados, construímos **duas personas** a partir do problema e de dados públicos:'),
  b('**Mariana Oliveira**, gerente de operações de um supermercado em Sorocaba. Tem lotes perfeitamente próprios para consumo perto do vencimento, mas, nas palavras da persona, a equipe "não tem tempo para negociar coletas pelo WhatsApp todo dia". Quer rapidez, segurança e um comprovante para prestação de contas.'),
  b('**Carlos Mendes**, coordenador de uma ONG em Votorantim que atende mais de 120 famílias com um único veículo. A dor dele: "rodamos a cidade inteira sem saber ao certo se o lote ainda está disponível". Quer saber o que está disponível, o que é urgente e como agrupar as coletas.'),
  p('O cruzamento das duas dores mostrou o que o sistema precisa fazer: **avisar o que está disponível e o que é urgente, garantir quem vai buscar e quando, planejar a rota e deixar tudo registrado.** Dessas necessidades saíram os requisitos do ConectaFome (que nas primeiras versões se chamava DOA+).'),
  p('Depois vieram o modelo de dados, a identidade visual verde (alimento, cuidado, natureza) e o desenvolvimento em etapas, com testes automáticos em cada uma.', { after: 60 }),
]

const s3 = [
  H1('3. O que o sistema faz'),
  p('**O caminho de uma doação:**', { after: 60 }),
  table(['1. Registrar', '2. Reservar', '3. Agendar', '4. Coletar', '5. Confirmar', '6. Comprovar'], [
    ['O doador cadastra o alimento com foto, validade e janela de coleta', 'A ONG vê as oportunidades, da mais urgente à menos, e reserva', 'A administração monta a rota com veículo e voluntário', 'O voluntário coleta cada parada, com foto, pelo celular', 'O receptor confirma o recebimento', 'O doador baixa o comprovante, com QR de autenticidade'],
  ], [1511, 1511, 1512, 1512, 1512, 1513], { size: 18 }),
  spacer(100),
  table(['Perfil', 'Principais funcionalidades'], [
    ['Doador', ['Cadastro da doação com foto, validade, condição de armazenamento e declaração de que o alimento está próprio', 'Acompanha o histórico (quem fez o quê e quando) e emite o comprovante']],
    ['Receptor (ONG/família)', ['Painel de oportunidades ordenado por urgência, com foto e filtros', 'Reserva em um clique; libera a reserva se não puder buscar; confirma o recebimento']],
    ['Administração', ['Painel com a fila "precisa de atenção": cadastros a aprovar, urgentes sem reserva, reservadas sem rota, coletadas sem confirmação', 'Aprovação de cadastros, rotas com mapa e controle de carga do veículo, relatórios com exportação CSV']],
    ['Voluntário', ['Abre o link da rota no celular, sem criar conta; vê endereço, contato e o que coletar', 'Registra cada parada como coletada (com foto e peso) ou não coletada (com motivo)']],
  ], [1900, 7171], { size: 19, firstColFill: true }),
  spacer(80),
  p('**Confiança e segurança:** CPF/CNPJ validado, aprovação de cada cadastro pela administração, vencimento automático de doações fora do prazo, reserva que volta ao painel se ninguém busca, recuperação de senha e controle de acesso por perfil.'),
  p('**Alguns números do projeto:** cerca de 13 mil linhas de código TypeScript, 26 telas, 80 rotas de API, 12 tabelas e **549 testes automáticos** (309 do servidor, 105 de integração com banco real e 135 da interface).'),
]

const s4 = [
  H1('4. Existem sistemas parecidos?'),
  p('**Sim.** O problema é conhecido e já há iniciativas. Isso é bom sinal de que a necessidade é real, e por isso precisamos dizer claramente onde o ConectaFome se encaixa. Levantamento a partir de reportagens e fontes públicas; **não testamos essas ferramentas** por dentro.'),
  table(['Iniciativa', 'O que é', 'Observação'], [
    ['Mesa Brasil Sesc', 'Programa de segurança alimentar do Sesc, com presença em Sorocaba, Votorantim e Araçoiaba da Serra desde 2017', 'Rede consolidada, operação institucional'],
    ['Comida Invisível', 'Plataforma brasileira que conecta restaurantes e outros doadores (inclusive pessoas físicas) a ONGs. Em 2019: 350 restaurantes e 400 ONGs cadastrados; parceria com a Ambev em 2022', 'Conexão doador ↔ ONG, em escala nacional'],
    ['Connecting Food', 'Startup brasileira que mapeia ONGs no entorno de lojas de grandes redes para doar itens dentro da validade', 'Foco em grandes redes de varejo'],
    ['Food to Save', 'Aplicativo de "sacolas surpresa" que vende excedente com desconto', 'Modelo comercial: vende, não doa'],
    ['Bancos de alimentos (ex.: Ceagesp)', 'Centrais que recebem e redistribuem alimentos', 'Recebem em ponto fixo, não organizam a coleta no doador'],
  ], [2000, 4571, 2500], { size: 18, firstColFill: true }),
  spacer(100),
  H2('O nosso diferencial'),
  p('Não dizemos que o ConectaFome é o único. O que propomos de diferente, em conjunto, é uma **operação local ponta a ponta, simples e verificável**:', { after: 60 }),
  b('**A coleta faz parte do sistema.** Reserva, rota com voluntário e veículo, mapa, ordem das paradas e controle de carga, e não só a "vitrine" de doações.'),
  b('**Prova em cada etapa.** Foto do alimento ao ofertar, foto na coleta (pelo voluntário, sem cadastro, por um link da rota) e foto do recebimento, tudo no histórico.'),
  b('**Comprovante verificável.** Código DOA-00042 e QR code que leva a uma página pública de conferência (sem endereços nem documentos), útil para prestação de contas e ESG do doador.'),
  b('**Pensado para o pequeno.** ONGs, coletivos e comércios de bairro, com custo de operação próximo de zero nos planos gratuitos, e **código aberto** para quem quiser adaptar ou rodar junto com redes já existentes.'),
  b('**Urgência e prazos automáticos.** Prioriza o que vence primeiro, vence sozinho o que passou do prazo e devolve ao painel a reserva que ninguém buscou.'),
  p('**Onde eles são melhores que nós:** escala, marca, parcerias com grandes empresas e equipes de campo. Somos um MVP acadêmico: nosso caminho é provar o modelo em escala local (piloto) e, se funcionar, operar junto com essas redes e não contra elas.', { before: 60 }),
]

const s5 = [
  H1('5. Linguagens, ferramentas e hospedagem'),
  table(['Camada', 'Linguagem', 'Principais ferramentas'], [
    ['Front-end (o que o usuário vê)', 'TypeScript, HTML e CSS', 'React 19, Vite, Tailwind CSS, TanStack Query, React Hook Form + Zod, Recharts (gráficos) e Leaflet + OpenStreetMap (mapas)'],
    ['Back-end (as regras do sistema)', 'TypeScript (Node.js 20+)', 'Express, Prisma ORM, Zod (validação), JWT em cookies protegidos, bcrypt (senhas), Helmet e limitação de requisições (segurança), sharp (tratamento de fotos), Nodemailer (e-mail)'],
    ['Banco de dados', 'SQL (PostgreSQL)', '12 tabelas criadas por 8 migrações versionadas; acesso pelo Prisma'],
    ['Qualidade', 'TypeScript', 'Vitest e Testing Library (549 testes), GitHub Actions (testes e auditoria a cada alteração)'],
  ], [2300, 1900, 4871], { size: 18, firstColFill: true }),
  spacer(100),
  table(['O que hospeda', 'Onde', 'Detalhe'], [
    ['Site (front-end)', 'Vercel', 'Também encaminha as chamadas da API (mesmo domínio, o que evita bloqueio de login em celulares)'],
    ['API (back-end)', 'Render', 'Plano gratuito; configuração versionada no repositório (render.yaml)'],
    ['Banco de dados', 'Supabase (PostgreSQL)', 'Plano gratuito'],
    ['Fotos', 'Supabase Storage (bucket privado)', 'Ativadas quando o armazenamento está configurado; as imagens só saem pelo sistema, a quem tem permissão'],
    ['Código e automações', 'GitHub e GitHub Actions', 'Versionamento, testes automáticos e a rotina que a cada 15 minutos vence prazos e mantém o servidor acordado'],
  ], [2300, 2700, 4071], { size: 18, firstColFill: true }),
]

const s6 = [
  H1('6. Principais desafios do desenvolvimento'),
  table(['Desafio', 'Como foi resolvido'], [
    ['Login que funcionava no computador e falhava no celular (navegadores bloqueiam cookies entre domínios diferentes)', 'O site passou a encaminhar a API pelo próprio domínio, o que torna o cookie "do mesmo site"'],
    ['Limites dos planos gratuitos: servidor que "dorme", disco apagado a cada publicação, banco que pausa', 'Rotina agendada que acorda o servidor, fotos em armazenamento externo e backup manual documentado'],
    ['Duas ONGs reservando a mesma doação no mesmo instante', 'Atualização condicional no banco: uma vence, a outra recebe aviso. Testado com PostgreSQL real'],
    ['Confiança: qualquer pessoa poderia se cadastrar como ONG', 'Validação de CPF/CNPJ e aprovação de cada cadastro pela administração'],
    ['O voluntário não tem conta e precisa registrar a coleta com foto', 'Link por rota, que expira em 48 h e pode ser cancelado, com fotos por parada'],
    ['Privacidade das fotos', 'Imagens reduzidas e sem dados de localização (EXIF), bucket privado e acesso só a quem faz parte da doação'],
    ['Planejar rotas sem prometer o impossível', 'Usamos uma heurística simples (vizinho mais próximo, distância em linha reta) e dizemos isso claramente: ela ajuda a decidir, não garante a rota mais curta'],
    ['Publicar sem dados de teste públicos', 'Em produção, o sistema cria apenas o administrador, com senha forte obrigatória'],
  ], [4300, 4771], { size: 18 }),
]

const s7 = [
  H1('7. Onde estamos e o que vem depois'),
  p('**Estado atual:** sistema funcional, publicado e coberto por testes automáticos. **Ainda não foi validado com ONGs e doadores reais**: o que foi feito é construção do produto e demonstração; a validação em campo é a próxima etapa.', { after: 60 }),
  b('**Piloto** em Sorocaba/Votorantim com poucos doadores e ONGs, medindo tempo até a coleta, taxa de vencimento e esforço de registro.'),
  b('**Política de privacidade e termos de uso** (LGPD) antes de receber famílias reais.'),
  b('Avisos por e-mail e WhatsApp e versão instalável no celular.'),
  b('Rotas por ruas (hoje a distância é em linha reta) e monitoramento automático de erros.'),
  spacer(60),
  H2('Perguntas que a banca pode fazer'),
  table(['Pergunta', 'Resposta sugerida'], [
    ['Já foi testado com ONGs de verdade?', 'Ainda não. O sistema está pronto e testado tecnicamente; o piloto com ONGs é a próxima etapa, e já deixamos o cadastro com aprovação para controlar quem entra.'],
    ['Quem garante que o alimento é seguro?', 'O sistema não mede segurança sanitária. O doador declara que o alimento está próprio (com data registrada), há foto em cada etapa e histórico completo. A responsabilidade segue a legislação vigente (a Lei nº 15.224/2025 substituiu a Lei nº 14.016/2020; o texto deve ser conferido antes de uso comercial).'],
    ['Por que não usar só o WhatsApp?', 'No WhatsApp não há prioridade por validade, garantia de quem vai buscar, rota, comprovante nem relatório. O sistema transforma conversa em processo registrado.'],
    ['Como se sustenta?', 'É um projeto acadêmico sem fins lucrativos, rodando em planos gratuitos. Para crescer, seria preciso hospedagem paga e uma entidade responsável pela operação.'],
    ['E a LGPD?', 'Coletamos o mínimo, fotos saem sem localização, acesso por perfil e cadastro aprovado. Falta a política de privacidade formal, que está nos próximos passos.'],
    ['A rota é a mais curta?', 'Não. É uma ajuda para decidir (heurística), e dizemos isso abertamente.'],
  ], [2800, 6271], { size: 18, firstColFill: true }),
]

const fontes = [
  H1('Fontes'),
  ...[
    'IBGE. Pesquisa Nacional por Amostra de Domicílios Contínua: Segurança Alimentar 2024. Rio de Janeiro: IBGE, 2025.',
    'UNEP. Food Waste Index Report 2024. Nairóbi: Programa das Nações Unidas para o Meio Ambiente, 2024.',
    'SESC SÃO PAULO. Mesa Brasil comemora resultados de 2018 no Sesc Sorocaba. 9 nov. 2018. portal.sescsp.org.br.',
    'BRASIL. Lei nº 15.224, de 30 de setembro de 2025 (Política Nacional de Combate à Perda e ao Desperdício de Alimentos).',
    'MERCADO & CONSUMO. Brasileira cria aplicativo para doação de alimentos que seriam descartados. 22 jun. 2019 (Comida Invisível).',
    'FORBES BRASIL. 10 foodtechs que estão ajudando na guerra contra o desperdício de alimentos. 2021 (Connecting Food, Food to Save).',
    'DIÁRIO DO NORDESTE. Plataforma conecta supermercados a ONGs do Ceará para doação de alimentos descartados.',
  ].map((t) => L.bullet(t, { size: 20, line: 280 })),
  p('Observação: as informações sobre Comida Invisível, Connecting Food e Food to Save vêm de resultados de busca sobre essas reportagens; confira os detalhes nas páginas originais antes de citar números em público.', { size: 18, color: GRAY, before: 80 }),
]

const doc = new Document({
  creator: 'Equipe ConectaFome',
  title: 'ConectaFome: documento de apoio à apresentação',
  styles,
  numbering,
  sections: [{ properties: { page: PAGE }, footers: { default: footer('ConectaFome · Apresentação') }, children: [...capa, L.pageBreak(), ...s1, ...s2, ...s3, ...s4, ...s5, ...s6, ...s7, ...fontes] }],
})

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, '..', 'APRESENTACAO_CONECTAFOME.docx')
  fs.writeFileSync(out, buf)
  console.log('ok', out, buf.length)
})
