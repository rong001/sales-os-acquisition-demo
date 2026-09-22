#!/usr/bin/env bash
# Production entry: build (if needed) + supervise start + optional tunnel.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DO_BUILD=0
DO_TUNNEL=0
for a in "$@"; do
  case "$a" in
    --build) DO_BUILD=1 ;;
    --tunnel) DO_TUNNEL=1 ;;
  esac
done
if [[ "$DO_BUILD" = 1 ]] || [[ ! -f apps/web/dist/index.html ]] || [[ ! -f apps/api/dist/main.js ]]; then
  echo "== npm run build =="
  npm run build
fi
bash "$ROOT/scripts/supervise.sh" restart
if [[ "$DO_TUNNEL" = 1 ]]; then
  bash "$ROOT/scripts/supervise.sh" start-cloudflared
fi
bash "$ROOT/scripts/supervise.sh" status
