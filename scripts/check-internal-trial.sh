#!/usr/bin/env bash
# Read-only / boot-gate check for internal trial (Linux/macOS bot or host).
# Same gate as Test-InternalTrial.ps1: GET http://127.0.0.1:HOST_WEB_PORT/api/health
# must be HTTP 2xx with JSON ok=true and service=sales-os-api. Never dump compose config or raw .env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }

ENV_FILE="${ENV_FILE:-$ROOT/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.internal-trial.yml}"

[[ -f "$COMPOSE_FILE" ]] || fail "missing docker-compose.internal-trial.yml"
[[ -f "$ENV_FILE" ]] || fail "missing .env (contents not printed)"

if ! command -v docker >/dev/null 2>&1; then
  fail "docker-not-running: docker not in PATH"
fi
if ! docker info >/dev/null 2>&1; then
  fail "docker-not-running: docker daemon not running"
fi

# Parse .env key=value (no print of values)
declare -A ENVMAP=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key="${key%"${key##*[![:space:]]}"}"
  key="${key#"${key%%[![:space:]]*}"}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ "${val}" =~ ^\".*\"$ || "${val}" =~ ^\'.*\'$ ]]; then
    val="${val:1:${#val}-2}"
  fi
  ENVMAP["$key"]="$val"
done < "$ENV_FILE"

REQUIRED=(
  POSTGRES_PASSWORD JWT_SECRET
  DEMO_AGENT_PASSWORD DEMO_AGENT2_PASSWORD
  DEMO_ADMIN_PASSWORD DEMO_MANAGER_PASSWORD DEMO_VIEWER_PASSWORD
)
bad=()
for k in "${REQUIRED[@]}"; do
  v="${ENVMAP[$k]:-}"
  if [[ -z "$v" || "$v" == "CHANGE_ME" ]]; then
    bad+=("$k")
  fi
done
if ((${#bad[@]} > 0)); then
  fail "Required .env keys empty or CHANGE_ME: $(IFS=,; echo "${bad[*]}")"
fi

# Prefer values from ENV_FILE map; ambient HOST_* only if file omitted the key.
WEB_PORT="${ENVMAP[HOST_WEB_PORT]:-${HOST_WEB_PORT:-18180}}"
API_PORT="${ENVMAP[HOST_API_PORT]:-${HOST_API_PORT:-3100}}"
HEALTH_URL="http://127.0.0.1:${WEB_PORT}/api/health"

redact() {
  local s="${1:-}"
  s="$(printf '%s' "$s" | tr '\n' ' ' | sed -E 's/(password|secret|token|authorization|bearer)[[:space:]]*[:=][[:space:]]*[^[:space:]]+/\1=***/Ig')"
  if ((${#s} > 120)); then s="${s:0:120}..."; fi
  printf '%s' "$s"
}

json_health_ok() {
  local body="$1"
  command -v python3 >/dev/null 2>&1 || return 1
  printf '%s' "$body" | python3 -c '
import sys, json
raw = sys.stdin.read()
raw_s = raw.lstrip()
if not raw_s.startswith("{") and not raw_s.startswith("["):
    sys.exit(1)
try:
    j = json.loads(raw)
except Exception:
    sys.exit(1)
ok = j.get("ok") is True
svc = j.get("service") == "sales-os-api"
sys.exit(0 if ok and svc else 1)
' 2>/dev/null
}

WAIT_SECS="${WAIT_SECS:-0}"
deadline=$((SECONDS + WAIT_SECS))
last_code=""
last_body=""
passed=0

echo "Checking ${HEALTH_URL} ..."
while true; do
  set +e
  resp="$(curl -sS -m 5 -w '\n%{http_code}' "$HEALTH_URL" 2>&1)"
  curl_ec=$?
  set -e
  if [[ $curl_ec -eq 0 ]]; then
    last_code="${resp##*$'\n'}"
    last_body="${resp%$'\n'*}"
    if [[ "$last_code" =~ ^2[0-9][0-9]$ ]] && json_health_ok "$last_body"; then
      passed=1
      break
    fi
  else
    last_code=""
    last_body="$resp"
  fi
  if (( WAIT_SECS <= 0 || SECONDS >= deadline )); then
    break
  fi
  sleep 2
done

if (( passed == 1 )); then
  echo "OK. http://127.0.0.1:${WEB_PORT}  (web /api/health = ok + sales-os-api)"
  exit 0
fi

api_ok=0
api_snip=""
set +e
aresp="$(curl -sS -m 5 -w '\n%{http_code}' "http://127.0.0.1:${API_PORT}/health" 2>&1)"
aec=$?
set -e
if [[ $aec -eq 0 ]]; then
  acode="${aresp##*$'\n'}"
  abody="${aresp%$'\n'*}"
  api_snip="$(redact "$abody")"
  if [[ "$acode" =~ ^2[0-9][0-9]$ ]] && json_health_ok "$abody"; then
    api_ok=1
  fi
else
  api_snip="$(redact "$aresp")"
fi

class="api-or-db-not-ready"
if (( api_ok == 1 )); then class="web-proxy-broken"; fi

echo "FAIL: ${class}" >&2
if [[ -n "$last_code" ]]; then echo "Last HTTP: $last_code" >&2; else echo "Last HTTP: (no response)" >&2; fi
echo "Last body snippet: $(redact "$last_body")" >&2
echo "Direct API healthy: $api_ok  snippet: $api_snip" >&2
set +e
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --format '{{.Name}} {{.Status}}' 2>/dev/null | while read -r line; do
  [[ -n "$line" ]] && echo "  $line" >&2
done
set -e
echo "服务不可用。" >&2
exit 1
