#!/usr/bin/env bash
# Cópia de segurança do banco (Supabase) em um arquivo .sql.gz no seu computador.
# O plano gratuito do Supabase NÃO tem backup que dê para restaurar sozinho; por isso
# rode isto uma vez por semana (e antes de qualquer mudança grande).
#
# Uso:   DATABASE_URL='postgresql://...pooler.supabase.com:5432/postgres' bash scripts/backup.sh
# Exige o `pg_dump` (vem com o PostgreSQL; no Windows, use o Git Bash com o PostgreSQL instalado).
# O arquivo contém dados pessoais: guarde em lugar privado e NÃO envie ao GitHub.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL com a string de conexão do Supabase (Session pooler, porta 5432)." >&2
  exit 1
fi
command -v pg_dump >/dev/null || { echo "pg_dump não encontrado. Instale o PostgreSQL (só as ferramentas de linha de comando bastam)." >&2; exit 1; }

OUT="backup-conectafome-$(date +%Y%m%d-%H%M).sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$OUT"
echo "Backup salvo em: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Lembrete: as FOTOS ficam no Supabase Storage, fora deste arquivo."
