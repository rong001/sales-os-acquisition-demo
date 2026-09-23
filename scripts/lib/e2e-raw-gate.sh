# Shared raw-artifact gate for legacy e2e bash scripts.
# Default OFF for durable/repo paths: never leave JWT/raw API bodies under docs/.
# Opt-in durable raw: SALES_OS_E2E_UNSAFE_RAW=1
#
# Trial packs MUST use scripts/acceptance/business-acceptance.mjs instead.
# shellcheck shell=bash

UNSAFE_RAW="${SALES_OS_E2E_UNSAFE_RAW:-0}"

e2e_raw_dir_init() {
  local requested="$1"
  if [[ "$UNSAFE_RAW" == "1" ]]; then
    mkdir -p "$requested"
    RAW="$requested"
    echo "WARN: SALES_OS_E2E_UNSAFE_RAW=1 — durable raw JWT/API bodies under $RAW" >&2
  else
    # Ephemeral only (not under docs/, cleaned on EXIT). Scripts may re-read for asserts.
    RAW="$(mktemp -d "${TMPDIR:-/tmp}/sales-os-e2e-raw.XXXXXX")"
    # shellcheck disable=SC2064
    trap 'rm -rf "'"$RAW"'"' EXIT
    echo "INFO: e2e raw artifacts ephemeral at \$RAW (not delivered); set SALES_OS_E2E_UNSAFE_RAW=1 for durable .raw-run" >&2
  fi
}

# Usage: printf '%s' "$body" | e2e_raw_write "$path"
e2e_raw_write() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
  cat > "$path"
}

e2e_curl_code_out() {
  local outpath="$1"; shift
  mkdir -p "$(dirname "$outpath")"
  curl -s -o "$outpath" -w '%{http_code}' "$@"
}
