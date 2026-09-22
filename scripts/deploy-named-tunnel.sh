#!/usr/bin/env bash
# Start Cloudflare Named Tunnel for sales-os gateway :18180.
# Does NOT invent a fixed domain. Requires user-provided DOMAIN / TUNNEL_ID / credentials.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_BIN="${CLOUDFLARED_BIN:-/workspace/cloudflared}"
[[ -x "$CF_BIN" ]] || CF_BIN="$(command -v cloudflared || true)"
[[ -n "$CF_BIN" && -x "$CF_BIN" ]] || { echo "cloudflared not found" >&2; exit 1; }

DOMAIN="${DOMAIN:-}"
TUNNEL_ID="${TUNNEL_ID:-}"
CRED_PATH="${CRED_PATH:-}"
CONFIG="${NAMED_TUNNEL_CONFIG:-}"

if [[ -z "$DOMAIN" || -z "$TUNNEL_ID" || -z "$CRED_PATH" ]]; then
  cat >&2 <<MSG
BLOCKED: fixed production domain not configured in this environment.

Required env (user-provided):
  DOMAIN=sales-demo.example.com
  TUNNEL_ID=<uuid>
  CRED_PATH=/absolute/path/to/<uuid>.json

Optional:
  NAMED_TUNNEL_CONFIG=/path/to/sales-os.yml
  (or script will render from deploy/cloudflared-named-tunnel.example.yml)

See docs/PROD_HTTPS.md and docs/USER_ACTIONS.md.
MSG
  exit 2
fi

[[ -f "$CRED_PATH" ]] || { echo "credentials file missing: $CRED_PATH" >&2; exit 1; }

if [[ -z "$CONFIG" ]]; then
  CONFIG="$ROOT/var/run/named-tunnel.yml"
  mkdir -p "$ROOT/var/run"
  sed -e "s|TUNNEL_ID|$TUNNEL_ID|g" \
      -e "s|DOMAIN|$DOMAIN|g" \
      -e "s|CRED_PATH|$CRED_PATH|g" \
      "$ROOT/deploy/cloudflared-named-tunnel.example.yml" > "$CONFIG"
fi

# Stop ONLY sales-os quick tunnel (supervise stop-cloudflared), not other projects.
bash "$ROOT/scripts/supervise.sh" stop-cloudflared 2>/dev/null || true

echo "Starting named tunnel DOMAIN=$DOMAIN TUNNEL_ID=$TUNNEL_ID → 127.0.0.1:18180"
exec "$CF_BIN" tunnel --config "$CONFIG" run "$TUNNEL_ID"
