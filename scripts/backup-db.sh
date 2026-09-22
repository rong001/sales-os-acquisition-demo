#!/usr/bin/env bash
# Backup ONLY the sales_os database into var/backups/ (gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a
DB_URL="${DATABASE_URL:-postgres://sales:sales@127.0.0.1:5432/sales_os}"
OUT_DIR="${1:-$ROOT/var/backups}"
mkdir -p "$OUT_DIR"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$OUT_DIR/sales_os-${TS}.dump"
# custom format for pg_restore
pg_dump "$DB_URL" --format=custom --no-owner --no-acl --dbname=sales_os -f "$OUT" 2>/dev/null \
  || pg_dump "$DB_URL" --format=custom --no-owner --no-acl -f "$OUT"
ln -sfn "$(basename "$OUT")" "$OUT_DIR/sales_os-latest.dump"
echo "Backup OK: $OUT"
ls -lh "$OUT"
