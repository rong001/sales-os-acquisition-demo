#!/usr/bin/env bash
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:3100}"
PASS="${DEMO_AGENT_PASSWORD:-demo1234}"

echo "== health =="
curl -sf "$API/health"
echo

echo "== login =="
LOGIN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"agent@demo.local\",\"password\":\"$PASS\"}")
TOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$LOGIN")
AUTH="Authorization: Bearer $TOKEN"

PHONE="139$(date +%s | tail -c 9)"
echo "== intake phone=$PHONE =="
INTAKE=$(curl -sf -X POST "$API/leads/intake" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"name\":\"冒烟客户\",\"source_type\":\"ad_form\",\"campaign\":\"smoke\",\"product_code\":\"ticket-grab\",\"consent_accepted\":true}")
CASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$INTAKE")

curl -sf -X POST "$API/leads/$CASE_ID/qualify" -H "$AUTH" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -sf -X POST "$API/leads/$CASE_ID/assign" -H "$AUTH" -H 'Content-Type: application/json' -d '{}' >/dev/null
ATTEMPT=$(curl -sf -X POST "$API/leads/$CASE_ID/reach-attempts" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"channel":"mock_call"}')
ATTEMPT_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$ATTEMPT")
RECEIPT=$(curl -sf -X POST "$API/reach-attempts/$ATTEMPT_ID/mock-receipt" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"result_code":"connected_intent"}')
APPT_ID=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("appointment") or {}).get("id",""))' <<<"$RECEIPT")
if [[ -z "$APPT_ID" ]]; then
  DRAFT=$(curl -sf -X POST "$API/leads/$CASE_ID/appointments/draft" -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
  APPT_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$DRAFT")
fi
CONFIRM=$(curl -sf -X POST "$API/appointments/$APPT_ID/confirm" -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
EVENT=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("event",""))' <<<"$CONFIRM")
test "$EVENT" = "conversion.appointment_valid"
STAGE=$(curl -sf "$API/leads/$CASE_ID" -H "$AUTH" | python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["stage"])')
test "$STAGE" = "APPOINTED"
echo "SMOKE M1 OK case=$CASE_ID appointment=$APPT_ID"
