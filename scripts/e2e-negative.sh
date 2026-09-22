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

# --- rate limit (IP+phone sliding window) ---
RL_PHONE="138$(date +%s | tail -c 9)"
RL_OK=0
RL_429=0
for i in $(seq 1 12); do
  code=$(curl -s -o "$OUT_DIR/14-rate-$i.json" -w '%{http_code}' \
    -X POST "$API/public/leads/intake" -H 'Content-Type: application/json' \
    -d "{\"product_code\":\"ticket-grab\",\"name\":\"限流$i\",\"phone\":\"$RL_PHONE\",\"consent_accepted\":true,\"utm_source\":\"ratetest\"}" || true)
  echo "rate_attempt_$i → HTTP $code" | tee -a "$OUT_DIR/run.log"
  if [[ "$code" == "201" || "$code" == "200" ]]; then RL_OK=$((RL_OK+1)); fi
  if [[ "$code" == "429" ]]; then RL_429=$((RL_429+1)); fi
done
[[ "$RL_429" -ge 1 ]] || fail "expected at least one 429 rate limit, got ok=$RL_OK r429=$RL_429"
pass "rate limit triggered (ok=$RL_OK, 429=$RL_429)"
cp "$OUT_DIR/14-rate-12.json" "$OUT_DIR/14-rate-limit-last.json"

# --- audit list: admin full, viewer redacted ---
curl -sf "$API/admin/audits?limit=20" -H "Authorization: Bearer $ADTOKEN" | tee "$OUT_DIR/15-admin-audits.json" >/dev/null
curl -sf "$API/admin/audits?limit=20" -H "$VAUTH" | tee "$OUT_DIR/16-viewer-audits.json" >/dev/null
python3 -c '
import json, os, sys
path = os.environ["OUT_DIR"] + "/16-viewer-audits.json"
v = json.load(open(path))
assert isinstance(v, list) and len(v) >= 1, "viewer audits empty"
for a in v:
    actor = a.get("actor_user_id")
    if actor not in (None, "***"):
        raise SystemExit("viewer actor not redacted: %r" % (actor,))
print("viewer audits redaction ok count", len(v))
' | tee -a "$OUT_DIR/run.log"
pass "audit list admin+viewer"

# --- mark result + conversion ---
MR=$(curl -sf -X POST "$API/leads/$CASE_ID/mark-result" -H "Authorization: Bearer $ATOKEN" -H 'Content-Type: application/json' \
  -d '{"result":"won","note":"合成赢单"}')
echo "$MR" | tee "$OUT_DIR/17-mark-result.json" >/dev/null
curl -sf "$API/admin/conversion" -H "Authorization: Bearer $ADTOKEN" | tee "$OUT_DIR/18-conversion.json" >/dev/null
curl -sf "$API/public/pages/ticket-grab-overview" | tee "$OUT_DIR/19-content-page.json" >/dev/null
curl -sf "$API/public/r/wx-ticket" | tee "$OUT_DIR/20-channel-redirect.json" >/dev/null
pass "mark-result + conversion + content + redirect"

# viewer cannot mark result
expect_status 403 "viewer_mark_result_forbidden" "$OUT_DIR/21-viewer-mark.json" \
  -X POST "$API/leads/$CASE_ID/mark-result" -H "$VAUTH" -H 'Content-Type: application/json' \
  -d '{"result":"lost"}'
pass "viewer mark-result forbidden"

echo "E2E_NEGATIVE_EXTENDED_OK" | tee -a "$OUT_DIR/PASS.txt" | tee -a "$OUT_DIR/run.log"
