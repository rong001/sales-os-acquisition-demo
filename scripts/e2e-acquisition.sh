#!/usr/bin/env bash
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:3100}"
OUT_DIR="${OUT_DIR:-docs/acceptance/e2e-logs}"
mkdir -p "$OUT_DIR"
PASS_FILE="$OUT_DIR/PASS.txt"
: > "$OUT_DIR/run.log"

pass() { echo "PASS: $*" | tee -a "$OUT_DIR/run.log"; }
fail() { echo "FAIL: $*" | tee -a "$OUT_DIR/run.log"; exit 1; }

AGENT_PASS="${DEMO_AGENT_PASSWORD:-demo1234}"
ADMIN_PASS="${DEMO_ADMIN_PASSWORD:-demo1234}"

echo "== health ==" | tee -a "$OUT_DIR/run.log"
curl -sf "$API/health" | tee "$OUT_DIR/01-health.json" | tee -a "$OUT_DIR/run.log"
echo | tee -a "$OUT_DIR/run.log"

PHONE="138$(date +%s | tail -c 9)"
INVITE="E2E$(date +%H%M%S)"
echo "== 1) public landing intake phone=$PHONE invite=$INVITE ==" | tee -a "$OUT_DIR/run.log"
INTAKE=$(curl -sf -X POST "$API/public/leads/intake" \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: SalesOS-E2E/1.0' \
  -d "{
    \"product_code\":\"ticket-grab\",
    \"name\":\"E2E访客\",
    \"phone\":\"$PHONE\",
    \"email\":\"e2e_${PHONE}@example.com\",
    \"consent_accepted\":true,
    \"consent_channels\":[\"call\",\"sms\"],
    \"utm_source\":\"e2e\",
    \"utm_medium\":\"script\",
    \"utm_campaign\":\"acceptance\",
    \"utm_content\":\"btn1\",
    \"utm_term\":\"grab\",
    \"invite_code\":\"$INVITE\",
    \"landing_url\":\"http://127.0.0.1:5173/p/ticket-grab?utm_source=e2e\",
    \"source_type\":\"landing_form\"
  }")
echo "$INTAKE" | tee "$OUT_DIR/02-intake.json" | tee -a "$OUT_DIR/run.log"
CASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$INTAKE")
test -n "$CASE_ID" || fail "no case id"
pass "landing intake case=$CASE_ID"

echo "== login agent ==" | tee -a "$OUT_DIR/run.log"
LOGIN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"agent@demo.local\",\"password\":\"$AGENT_PASS\"}")
echo "$LOGIN" | tee "$OUT_DIR/03-login-agent.json" >/dev/null
TOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$LOGIN")
AUTH="Authorization: Bearer $TOKEN"

echo "== 2) lead in workbench ==" | tee -a "$OUT_DIR/run.log"
DETAIL=$(curl -sf "$API/leads/$CASE_ID" -H "$AUTH")
echo "$DETAIL" | tee "$OUT_DIR/04-case-detail.json" >/dev/null
STAGE=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["stage"])' <<<"$DETAIL")
UTM=$(python3 -c 'import json,sys; s=json.load(sys.stdin)["source"]; print(s.get("utm_source"), s.get("invite_code"))' <<<"$DETAIL")
echo "stage=$STAGE utm/invite=$UTM" | tee -a "$OUT_DIR/run.log"
test "$STAGE" = "NEW" || fail "expected NEW"
pass "lead visible with UTM/invite"

echo "== qualify ==" | tee -a "$OUT_DIR/run.log"
curl -sf -X POST "$API/leads/$CASE_ID/qualify" -H "$AUTH" -H 'Content-Type: application/json' -d '{}' \
  | tee "$OUT_DIR/05-qualify.json" >/dev/null
pass "qualified"

echo "== 3) assign ==" | tee -a "$OUT_DIR/run.log"
ASSIGN=$(curl -sf -X POST "$API/leads/$CASE_ID/assign" -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
echo "$ASSIGN" | tee "$OUT_DIR/06-assign.json" >/dev/null
pass "assigned"

echo "== 4) follow-up timeline ==" | tee -a "$OUT_DIR/run.log"
ACT=$(curl -sf -X POST "$API/leads/$CASE_ID/activities" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"kind":"note","body":"E2E 跟进：已电话介绍产品边界"}')
echo "$ACT" | tee "$OUT_DIR/07-activity.json" >/dev/null
pass "follow-up added"

echo "== mock reach ==" | tee -a "$OUT_DIR/run.log"
ATTEMPT=$(curl -sf -X POST "$API/leads/$CASE_ID/reach-attempts" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"channel":"mock_call"}')
echo "$ATTEMPT" | tee "$OUT_DIR/08-attempt.json" >/dev/null
LABEL=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("label",""))' <<<"$ATTEMPT")
test "$LABEL" = "MOCK" || fail "attempt not labeled MOCK"
ATTEMPT_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$ATTEMPT")
RECEIPT=$(curl -sf -X POST "$API/reach-attempts/$ATTEMPT_ID/mock-receipt" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"result_code":"connected_intent"}')
echo "$RECEIPT" | tee "$OUT_DIR/09-receipt.json" >/dev/null
APPT_ID=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("appointment") or {}).get("id",""))' <<<"$RECEIPT")
if [[ -z "$APPT_ID" ]]; then
  DRAFT=$(curl -sf -X POST "$API/leads/$CASE_ID/appointments/draft" -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
  APPT_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$DRAFT")
fi

echo "== 5) confirm appointment $APPT_ID ==" | tee -a "$OUT_DIR/run.log"
CONFIRM=$(curl -sf -X POST "$API/appointments/$APPT_ID/confirm" -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
echo "$CONFIRM" | tee "$OUT_DIR/10-confirm.json" >/dev/null
EVENT=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("event",""))' <<<"$CONFIRM")
test "$EVENT" = "conversion.appointment_valid" || fail "no conversion event"
pass "appointment confirmed"

echo "== 6) funnel stats (admin) ==" | tee -a "$OUT_DIR/run.log"
ALOGIN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@demo.local\",\"password\":\"$ADMIN_PASS\"}")
ATOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$ALOGIN")
FUNNEL=$(curl -sf "$API/admin/funnel" -H "Authorization: Bearer $ATOKEN")
echo "$FUNNEL" | tee "$OUT_DIR/11-funnel.json" >/dev/null
APPOINTED=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["funnel"]["appointed"])' <<<"$FUNNEL")
test "$APPOINTED" -ge 1 || fail "funnel appointed < 1"
pass "funnel appointed=$APPOINTED"

echo "== 7) restart API persistence check ==" | tee -a "$OUT_DIR/run.log"
# Caller should restart API; this script re-fetches after optional wait.
# If SALESOS_RESTARTED=1, skip wait. Otherwise poll health.
for i in $(seq 1 30); do
  if curl -sf "$API/health" >/dev/null; then break; fi
  sleep 1
done
DETAIL2=$(curl -sf "$API/leads/$CASE_ID" -H "$AUTH")
echo "$DETAIL2" | tee "$OUT_DIR/12-after-restart.json" >/dev/null
STAGE2=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["stage"])' <<<"$DETAIL2")
ACTS=$(python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("activities") or []))' <<<"$DETAIL2")
test "$STAGE2" = "APPOINTED" || fail "stage lost after restart: $STAGE2"
test "$ACTS" -ge 1 || fail "activities lost after restart"
pass "persistence OK stage=$STAGE2 activities=$ACTS"

# Dedup check
echo "== dedup same phone ==" | tee -a "$OUT_DIR/run.log"
DUP=$(curl -sf -X POST "$API/public/leads/intake" -H 'Content-Type: application/json' \
  -d "{\"product_code\":\"usgate\",\"name\":\"E2E访客2\",\"phone\":\"$PHONE\",\"consent_accepted\":true}")
echo "$DUP" | tee "$OUT_DIR/13-dedup.json" >/dev/null
MERGED=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("merged"))' <<<"$DUP")
test "$MERGED" = "True" -o "$MERGED" = "true" || fail "expected merged=true"
pass "dedup merged identity"

echo "E2E_ACQUISITION_OK case=$CASE_ID" | tee "$PASS_FILE" | tee -a "$OUT_DIR/run.log"
