#!/usr/bin/env bash
# Negative acceptance: missing fields, no consent, RBAC denials, dedup merge.
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:3100}"
OUT_DIR="${OUT_DIR:-docs/acceptance/toc-stable/negative}"
mkdir -p "$OUT_DIR"
: > "$OUT_DIR/run.log"
pass() { echo "PASS: $*" | tee -a "$OUT_DIR/run.log"; }
fail() { echo "FAIL: $*" | tee -a "$OUT_DIR/run.log"; exit 1; }
expect_status() {
  local want="$1" label="$2" bodyfile="$3"
  shift 3
  local code
  code=$(curl -s -o "$bodyfile" -w '%{http_code}' "$@" || true)
  echo "$label → HTTP $code" | tee -a "$OUT_DIR/run.log"
  echo "body: $(head -c 500 "$bodyfile")" | tee -a "$OUT_DIR/run.log"
  [[ "$code" == "$want" ]] || fail "$label expected $want got $code"
}

AGENT_PASS="${DEMO_AGENT_PASSWORD:-demo1234}"
ADMIN_PASS="${DEMO_ADMIN_PASSWORD:-demo1234}"
VIEWER_PASS="${DEMO_VIEWER_PASSWORD:-demo-viewer}"

echo "== negative e2e against $API ==" | tee -a "$OUT_DIR/run.log"
curl -sf "$API/health" | tee "$OUT_DIR/00-health.json" >/dev/null

expect_status 400 "missing_contact" "$OUT_DIR/01-missing-contact.json" \
  -X POST "$API/public/leads/intake" -H 'Content-Type: application/json' \
  -d '{"product_code":"ticket-grab","name":"无联系方式","consent_accepted":true}'

expect_status 400 "no_consent" "$OUT_DIR/02-no-consent.json" \
  -X POST "$API/public/leads/intake" -H 'Content-Type: application/json' \
  -d '{"product_code":"ticket-grab","name":"未同意","phone":"13900001111","consent_accepted":false}'
pass "reject missing fields + no consent"

ALOGIN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"agent@demo.local\",\"password\":\"$AGENT_PASS\"}")
ATOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$ALOGIN")
expect_status 403 "agent_export_forbidden" "$OUT_DIR/03-agent-export.json" \
  "$API/admin/leads/export.csv" -H "Authorization: Bearer $ATOKEN"
pass "agent cannot export"

VLOGIN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"viewer@demo.local\",\"password\":\"$VIEWER_PASS\"}")
echo "$VLOGIN" | tee "$OUT_DIR/04-viewer-login.json" >/dev/null
VTOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$VLOGIN")
VROLE=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["role"])' <<<"$VLOGIN")
[[ "$VROLE" == "viewer" ]] || fail "viewer role=$VROLE"
VAUTH="Authorization: Bearer $VTOKEN"

curl -sf "$API/workbench/today" -H "$VAUTH" | tee "$OUT_DIR/05-viewer-workbench.json" >/dev/null
curl -sf "$API/admin/funnel" -H "$VAUTH" | tee "$OUT_DIR/06-viewer-funnel.json" >/dev/null
pass "viewer read workbench+funnel"

PHONE="137$(date +%s | tail -c 9)"
INTAKE=$(curl -sf -X POST "$API/public/leads/intake" -H 'Content-Type: application/json' \
  -d "{\"product_code\":\"usgate\",\"name\":\"负面用例\",\"phone\":\"$PHONE\",\"consent_accepted\":true,\"utm_source\":\"neg\"}")
CASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$INTAKE")
echo "$INTAKE" | tee "$OUT_DIR/07-intake-for-deny.json" >/dev/null

curl -sf "$API/leads/$CASE_ID" -H "$VAUTH" | tee "$OUT_DIR/08-viewer-case.json" >/dev/null
pass "viewer can read case"

expect_status 403 "viewer_qualify_forbidden" "$OUT_DIR/09-viewer-qualify.json" \
  -X POST "$API/leads/$CASE_ID/qualify" -H "$VAUTH" -H 'Content-Type: application/json' -d '{}'
expect_status 403 "viewer_assign_forbidden" "$OUT_DIR/10-viewer-assign.json" \
  -X POST "$API/leads/$CASE_ID/assign" -H "$VAUTH" -H 'Content-Type: application/json' -d '{}'
expect_status 403 "viewer_export_forbidden" "$OUT_DIR/11-viewer-export.json" \
  "$API/admin/leads/export.csv" -H "$VAUTH"
pass "viewer writes+export forbidden"

DUP=$(curl -sf -X POST "$API/public/leads/intake" -H 'Content-Type: application/json' \
  -d "{\"product_code\":\"ticket-grab\",\"name\":\"重复手机\",\"phone\":\"$PHONE\",\"consent_accepted\":true}")
echo "$DUP" | tee "$OUT_DIR/12-dedup.json" >/dev/null
MERGED=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("merged"))' <<<"$DUP")
[[ "$MERGED" == "True" || "$MERGED" == "true" ]] || fail "expected merged=true got $MERGED"
pass "dedup merged"

ADLOGIN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@demo.local\",\"password\":\"$ADMIN_PASS\"}")
ADTOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$ADLOGIN")
expect_status 200 "admin_export_ok" "$OUT_DIR/13-admin-export.csv" \
  "$API/admin/leads/export.csv" -H "Authorization: Bearer $ADTOKEN"
pass "admin export ok"

echo "E2E_NEGATIVE_OK" | tee "$OUT_DIR/PASS.txt" | tee -a "$OUT_DIR/run.log"
