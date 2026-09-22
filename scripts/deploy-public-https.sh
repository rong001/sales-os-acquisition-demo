#!/usr/bin/env bash
# Re-deploy sales-os public HTTPS demo (ephemeral trycloudflare URL).
# Does NOT touch ports 4173/8080/8765/3000/3001 or other cloudflared tunnels.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/acceptance/public-https"
CF_BIN="${CLOUDFLARED_BIN:-/workspace/cloudflared}"
GATEWAY_PORT="${GATEWAY_PORT:-18180}"
mkdir -p "$OUT"

if ! ss -tlnp 2>/dev/null | grep -q ":$GATEWAY_PORT "; then
  echo "Starting gateway on 127.0.0.1:$GATEWAY_PORT ..."
  nohup node "$ROOT/deploy/public-gateway.mjs" > "$OUT/gateway.log" 2>&1 &
  sleep 0.5
fi
curl -sf "http://127.0.0.1:$GATEWAY_PORT/__gateway_health" >/dev/null

# Kill only OUR previous cloudflared to 18180 (match URL arg), leave others alone
while read -r pid; do
  [[ -n "$pid" ]] || continue
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  if echo "$cmd" | grep -q "127.0.0.1:$GATEWAY_PORT"; then
    echo "Stopping previous sales-os cloudflared pid=$pid"
    kill "$pid" 2>/dev/null || true
  fi
done < <(pgrep -f 'cloudflared tunnel' || true)
sleep 1

: > "$OUT/cloudflared.log"
nohup "$CF_BIN" tunnel --url "http://127.0.0.1:$GATEWAY_PORT" --no-autoupdate > "$OUT/cloudflared.log" 2>&1 &
echo "Waiting for trycloudflare URL..."
URL=""
for i in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$OUT/cloudflared.log" 2>/dev/null | head -1 || true)
  [[ -n "$URL" ]] && break
  sleep 0.5
done
if [[ -z "$URL" ]]; then
  echo "FAIL: no trycloudflare URL in $OUT/cloudflared.log" >&2
  exit 1
fi
echo "$URL" | tee "$OUT/PUBLIC_URL.txt"
echo "Public HTTPS: $URL"
echo "Landings: $URL/p/ticket-grab  $URL/p/usgate"
echo "Admin/login: $URL/"
