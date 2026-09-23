# Shared raw-artifact gate for legacy e2e bash scripts.
#
# Default: REFUSE any disk write of JWT / raw API bodies (including /tmp).
# Trial packs MUST use scripts/acceptance/business-acceptance.mjs (JWT in memory only).
#
# Opt-in durable/ephemeral disk raw (NOT for trial delivery):
#   SALES_OS_E2E_UNSAFE_RAW=1
#
# shellcheck shell=bash

UNSAFE_RAW="${SALES_OS_E2E_UNSAFE_RAW:-0}"

e2e_raw_dir_init() {
  local requested="$1"
  if [[ "$UNSAFE_RAW" == "1" ]]; then
    mkdir -p "$requested"
    RAW="$requested"
    echo "WARN: SALES_OS_E2E_UNSAFE_RAW=1 — raw JWT/API bodies under $RAW (NOT memory-only; NOT for trial packs)" >&2
  else
    # Memory-only policy: do not create /tmp or docs raw dirs.
    RAW=""
    echo "INFO: e2e raw disk writes DISABLED (memory-only policy). Use scripts/acceptance/business-acceptance.mjs for trial packs. Set SALES_OS_E2E_UNSAFE_RAW=1 only for local unsafe debug." >&2
  fi
}

# Usage: printf '%s' "$body" | e2e_raw_write "$path"
e2e_raw_write() {
  local path="$1"
  if [[ "$UNSAFE_RAW" != "1" ]]; then
    echo "REFUSE: e2e_raw_write blocked (would touch disk). Use business-acceptance.mjs or SALES_OS_E2E_UNSAFE_RAW=1" >&2
    # Drain stdin so pipe callers don't SIGPIPE oddly
    cat >/dev/null || true
    return 1
  fi
  mkdir -p "$(dirname "$path")"
  cat > "$path"
}

e2e_curl_code_out() {
  local outpath="$1"; shift
  if [[ "$UNSAFE_RAW" != "1" ]]; then
    echo "REFUSE: e2e_curl_code_out blocked (would write JWT/body to disk at outpath). Use business-acceptance.mjs" >&2
    # Still perform request discarding body — return code only, no disk
    curl -s -o /dev/null -w '%{http_code}' "$@"
    return 0
  fi
  mkdir -p "$(dirname "$outpath")"
  curl -s -o "$outpath" -w '%{http_code}' "$@"
}
