#!/usr/bin/env bash
# Internal: restart-loop for one sales-os process. Args: NAME MARKER CMD...
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:?}"; shift
MARKER="${1:?}"; shift
LOG="$ROOT/var/log/$NAME.log"
PIDFILE="$ROOT/var/run/$NAME.pid"
SPIDFILE="$ROOT/var/run/${NAME}-supervisor.pid"
mkdir -p "$ROOT/var/log" "$ROOT/var/run"
echo $$ > "$SPIDFILE"
# shellcheck disable=SC1091
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a
export NODE_ENV="${NODE_ENV:-production}"
export GATEWAY_WEB_MODE="${GATEWAY_WEB_MODE:-static}"
export WEB_STATIC_DIR="${WEB_STATIC_DIR:-$ROOT/apps/web/dist}"
export API_PORT="${API_PORT:-3100}"
export PORT="${PORT:-$API_PORT}"

while true; do
  (
    cd "$ROOT"
    [[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a
    export NODE_ENV="${NODE_ENV:-production}"
    export GATEWAY_WEB_MODE="${GATEWAY_WEB_MODE:-static}"
    export WEB_STATIC_DIR="${WEB_STATIC_DIR:-$ROOT/apps/web/dist}"
    export API_PORT="${API_PORT:-3100}"
    export PORT="${PORT:-$API_PORT}"
    exec "$@"
  ) >> "$LOG" 2>&1 &
  CPID=$!
  echo "$CPID" > "$PIDFILE"
  echo "[$(date -Is)] $NAME started pid=$CPID" >> "$LOG"
  wait "$CPID" || true
  echo "[$(date -Is)] $NAME exited; restart in 2s" >> "$LOG"
  sleep 2
done
