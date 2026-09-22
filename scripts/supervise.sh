#!/usr/bin/env bash
# Manage sales-os prod processes with auto-restart (no systemd / no root).
# ONLY sales-os: API :3100, gateway :18180, worker, cloudflared→18180.
# NEVER touch 4173/8080/8765/3000/3001/5173 or other cloudflared.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VAR="$ROOT/var"
LOG="$VAR/log"
RUN="$VAR/run"
mkdir -p "$LOG" "$RUN"
API_PORT="${API_PORT:-3100}"
GATEWAY_PORT="${GATEWAY_PORT:-18180}"
CF_BIN="${CLOUDFLARED_BIN:-/workspace/cloudflared}"
[[ -x "$CF_BIN" ]] || CF_BIN="$(command -v cloudflared || true)"
ONE="$ROOT/scripts/supervise-one.sh"

usage() {
  echo "Usage: $0 {start|stop|restart|status|start-cloudflared|stop-cloudflared}"
}

is_alive() { [[ -n "${1:-}" && -d "/proc/$1" ]]; }

stop_name() {
  local name="$1"
  local sp="$RUN/${name}-supervisor.pid"
  local pf="$RUN/${name}.pid"
  if [[ -f "$sp" ]]; then
    local spid; spid=$(cat "$sp" 2>/dev/null || true)
    if is_alive "$spid"; then
      echo "Stopping ${name}-supervisor pid=$spid"
      # kill process group / children then supervisor
      pkill -P "$spid" 2>/dev/null || true
      kill "$spid" 2>/dev/null || true
      sleep 0.3
      kill -9 "$spid" 2>/dev/null || true
    fi
    rm -f "$sp"
  fi
  if [[ -f "$pf" ]]; then
    local pid; pid=$(cat "$pf" 2>/dev/null || true)
    if is_alive "$pid"; then
      echo "Stopping $name pid=$pid"
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pf"
  fi
}

cmd_stop() {
  stop_name api
  stop_name worker
  stop_name gateway
  # leftover by cmdline (sales-os only)
  pkill -f "$ROOT/apps/api/dist/main.js" 2>/dev/null || true
  pkill -f "$ROOT/apps/worker/dist/main.js" 2>/dev/null || true
  pkill -f "$ROOT/deploy/public-gateway.mjs" 2>/dev/null || true
  pkill -f "$ROOT/scripts/supervise-one.sh" 2>/dev/null || true
  sleep 0.5
  echo "Stopped sales-os supervised processes"
}

start_supervised() {
  local name="$1"; shift
  stop_name "$name"
  nohup "$ONE" "$name" "x" "$@" >/dev/null 2>&1 &
  echo "Supervising $name (supervisor pid $!)"
}

cmd_start() {
  [[ -f "$ROOT/apps/api/dist/main.js" ]] || { echo "missing api dist — npm run build" >&2; exit 1; }
  [[ -f "$ROOT/apps/web/dist/index.html" ]] || { echo "missing web dist — npm run build" >&2; exit 1; }

  # Stop sales-os Vite on 5174 if present (prod serves static via gateway)
  local vite_pid
  vite_pid=$(ss -tlnp 2>/dev/null | grep ':5174 ' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)
  if [[ -n "$vite_pid" ]]; then
    local vcmd; vcmd=$(tr '\0' ' ' < "/proc/$vite_pid/cmdline" 2>/dev/null || true)
    if echo "$vcmd" | grep -qiE 'sales-os|apps/web|@sales-os/web'; then
      echo "Stopping sales-os Vite :5174 pid=$vite_pid"
      kill "$vite_pid" 2>/dev/null || true
    fi
  fi

  # Stop any existing sales-os api/gateway before supervise (dev ts-node etc.)
  # Only if cmdline looks like sales-os
  local apid
  apid=$(ss -tlnp 2>/dev/null | grep ":${API_PORT} " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)
  if [[ -n "$apid" ]]; then
    local acmd; acmd=$(tr '\0' ' ' < "/proc/$apid/cmdline" 2>/dev/null || true)
    if echo "$acmd" | grep -qiE 'sales-os|apps/api|@sales-os/api'; then
      echo "Stopping existing sales-os API pid=$apid"
      kill "$apid" 2>/dev/null || true
      sleep 0.5
    else
      echo "WARN: :${API_PORT} held by non-sales-os? cmdline=$acmd" >&2
    fi
  fi
  local gpid
  gpid=$(ss -tlnp 2>/dev/null | grep ":${GATEWAY_PORT} " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)
  if [[ -n "$gpid" ]]; then
    local gcmd; gcmd=$(tr '\0' ' ' < "/proc/$gpid/cmdline" 2>/dev/null || true)
    if echo "$gcmd" | grep -qiE 'public-gateway|sales-os'; then
      echo "Stopping existing gateway pid=$gpid"
      kill "$gpid" 2>/dev/null || true
      sleep 0.5
    fi
  fi

  start_supervised api node "$ROOT/apps/api/dist/main.js"
  if [[ -f "$ROOT/apps/worker/dist/main.js" ]]; then
    start_supervised worker node "$ROOT/apps/worker/dist/main.js"
  fi
  start_supervised gateway env GATEWAY_WEB_MODE=static WEB_STATIC_DIR="$ROOT/apps/web/dist" \
    node "$ROOT/deploy/public-gateway.mjs"
  sleep 2
  cmd_status
}

cmd_status() {
  echo "=== sales-os supervise status ==="
  for n in api worker gateway cloudflared; do
    local pf="$RUN/$n.pid" sp="$RUN/${n}-supervisor.pid"
    local st="down"
    if [[ -f "$pf" ]] && is_alive "$(cat "$pf")"; then st="RUNNING pid=$(cat "$pf")"; fi
    local sst=""
    if [[ -f "$sp" ]] && is_alive "$(cat "$sp")"; then sst=" supervisor=$(cat "$sp")"; fi
    echo "  $n: $st$sst"
  done
  echo "--- sales-os ports ---"
  ss -tlnp 2>/dev/null | grep -E ':3100 |:18180 |:5174 ' || echo "(none)"
  echo "--- protected ports (untouched) ---"
  ss -tlnp 2>/dev/null | grep -E ':4173 |:8080 |:8765 |:3000 |:3001 |:5173 ' || echo "(none listening?)"
}

stop_our_cloudflared() {
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    local cmd; cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    if echo "$cmd" | grep -q "127.0.0.1:${GATEWAY_PORT}"; then
      echo "Stopping sales-os cloudflared pid=$pid"
      kill "$pid" 2>/dev/null || true
      sleep 0.4
      kill -9 "$pid" 2>/dev/null || true
    fi
  done < <(pgrep -f 'cloudflared tunnel' || true)
  rm -f "$RUN/cloudflared.pid"
}

cmd_start_cf() {
  [[ -n "$CF_BIN" && -x "$CF_BIN" ]] || { echo "cloudflared missing" >&2; exit 1; }
  stop_our_cloudflared
  local out="$ROOT/docs/acceptance/public-https"
  mkdir -p "$out"
  : > "$out/cloudflared.log"
  nohup "$CF_BIN" tunnel --url "http://127.0.0.1:${GATEWAY_PORT}" --no-autoupdate \
    > "$out/cloudflared.log" 2>&1 &
  echo $! > "$RUN/cloudflared.pid"
  echo "Waiting for trycloudflare URL (临时)..."
  local URL=""
  for i in $(seq 1 50); do
    URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$out/cloudflared.log" 2>/dev/null | head -1 || true)
    [[ -n "$URL" ]] && break
    sleep 0.5
  done
  [[ -n "$URL" ]] || { echo "FAIL: no trycloudflare URL" >&2; exit 1; }
  echo "$URL" | tee "$out/PUBLIC_URL.txt"
  echo "(临时隧道) Public HTTPS: $URL"
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; sleep 1; cmd_start ;;
  status) cmd_status ;;
  start-cloudflared) cmd_start_cf ;;
  stop-cloudflared) stop_our_cloudflared ;;
  *) usage; exit 1 ;;
esac
