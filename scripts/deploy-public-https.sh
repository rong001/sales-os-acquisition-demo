#!/usr/bin/env bash
# Re-deploy sales-os public HTTPS demo (ephemeral trycloudflare URL).
# Production static mode: gateway serves apps/web/dist; no Vite required.
# Does NOT touch ports 4173/8080/8765/3000/3001 or other cloudflared tunnels.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/acceptance/public-https"
mkdir -p "$OUT"

# Prefer supervised prod stack
if [[ "${SKIP_SUPERVISE:-}" != "1" ]]; then
  if [[ ! -f "$ROOT/apps/web/dist/index.html" || ! -f "$ROOT/apps/api/dist/main.js" ]]; then
    echo "Building production artifacts..."
    (cd "$ROOT" && npm run build)
  fi
  bash "$ROOT/scripts/supervise.sh" restart
else
  # Legacy: only ensure gateway
  if ! ss -tlnp 2>/dev/null | grep -q ':18180 '; then
    echo "Starting gateway on 127.0.0.1:18180 (static)..."
    nohup env GATEWAY_WEB_MODE=static WEB_STATIC_DIR="$ROOT/apps/web/dist" \
      node "$ROOT/deploy/public-gateway.mjs" > "$OUT/gateway.log" 2>&1 &
    sleep 0.5
  fi
fi

curl -sf "http://127.0.0.1:18180/__gateway_health" | tee "$OUT/gateway-health.json"
curl -sf "http://127.0.0.1:18180/__ready" | tee "$OUT/gateway-ready.json" || true

bash "$ROOT/scripts/supervise.sh" start-cloudflared
echo "Landings: $(cat "$OUT/PUBLIC_URL.txt")/p/ticket-grab  $(cat "$OUT/PUBLIC_URL.txt")/p/usgate"
echo "NOTE: trycloudflare URL is TEMPORARY."
