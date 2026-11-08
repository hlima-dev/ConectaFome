#!/usr/bin/env bash
# Teste de fumaça de um ambiente publicado (ou local).
# Uso: scripts/smoke.sh <URL_DA_API> <URL_DO_FRONTEND> [admin_email admin_senha]
# Ex.:  scripts/smoke.sh https://conectfome-backend.onrender.com https://conecta-fome.vercel.app
# Sai com código != 0 se algo falhar.
set -u
API="${1:?informe a URL da API}"; WEB="${2:?informe a URL do frontend}"; EMAIL="${3:-}"; PASS="${4:-}"
fail=0
check() { # descrição, comando que deve ter sucesso
  if eval "$2" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  FALHA $1"; fail=1; fi
}
code() { curl -s -o /dev/null -m 30 -w '%{http_code}' "$@"; }

echo "API: $API"
check "GET /health responde 200" '[ "$(code "$API/health")" = 200 ]'
check "rota protegida sem login responde 401" '[ "$(code "$API/api/v1/donations")" = 401 ]'
check "rota inexistente responde 404" '[ "$(code "$API/api/v1/nao-existe")" = 404 ]'
check "cabeçalhos de segurança (helmet)" 'curl -sI -m 30 "$API/health" | grep -qi "x-content-type-options: nosniff"'
check "CORS libera a origem do frontend" 'curl -sI -m 30 -H "Origin: $WEB" -H "Access-Control-Request-Method: GET" -X OPTIONS "$API/api/v1/donations" | grep -qi "access-control-allow-origin: $WEB"'
check "CORS NÃO libera uma origem qualquer" '! curl -sI -m 30 -H "Origin: https://site-malicioso.example" -X OPTIONS "$API/api/v1/donations" | grep -qi "access-control-allow-origin: https://site-malicioso.example"'

echo "Frontend: $WEB"
check "página inicial responde 200" '[ "$(code "$WEB/")" = 200 ]'
check "rota do app (/inicio) cai no index.html (SPA)" '[ "$(code "$WEB/inicio")" = 200 ]'

echo "Segurança"
check "a senha pública de demonstração NÃO entra como administrador" '[ "$(code -X POST -H "Content-Type: application/json" -d "{\"email\":\"admin@conectfome.org\",\"password\":\"Conect@123\"}" "$API/api/v1/auth/login")" != 200 ]'
if [ -n "$EMAIL" ]; then
  check "login do administrador configurado funciona" '[ "$(code -X POST -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$API/api/v1/auth/login")" = 200 ]'
fi

[ $fail = 0 ] && echo "TUDO OK" || echo "HÁ FALHAS"
exit $fail
