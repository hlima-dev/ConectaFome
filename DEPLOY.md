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

Observação do plano gratuito: o serviço "dorme" após alguns minutos sem uso e
a primeira requisição depois disso demora. Para a apresentação, abra o
endereço alguns minutos antes.

## 3. Frontend (Vercel)

1. **Add New → Project**, importe o repositório e defina **Root Directory =
   `frontend`**.
2. Variável de ambiente: `VITE_API_URL` = URL do backend no Render, **sem
   barra no final** (ex.: `https://conectfome-backend.onrender.com`).
3. O `frontend/vercel.json` já redireciona qualquer rota para o `index.html`
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
