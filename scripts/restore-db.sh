#!/usr/bin/env bash
# Restore sales_os from a pg_dump custom file. Does NOT touch other DBs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a
DB_URL="${DATABASE_URL:-postgres://sales:sales@127.0.0.1:5432/sales_os}"
DUMP="${1:-$ROOT/var/backups/sales_os-latest.dump}"
[[ -f "$DUMP" ]] || { echo "Usage: $0 path/to/sales_os-XXXX.dump" >&2; exit 1; }
echo "Restoring $DUMP → sales_os (will DROP objects in target DB)"
# --clean drops objects before recreate; scoped to connection DB only
pg_restore --clean --if-exists --no-owner --no-acl -d "$DB_URL" "$DUMP"
echo "Restore OK"
