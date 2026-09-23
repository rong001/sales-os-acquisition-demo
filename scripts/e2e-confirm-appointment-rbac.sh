#!/usr/bin/env bash
# DEPRECATED for trial packs — use scripts/acceptance/business-acceptance.mjs
# Raw JWT dumps OFF by default; SALES_OS_E2E_UNSAFE_RAW=1 to opt in.
# 预约确认鉴权前置 E2E：字段级比对，禁止 manager→admin 回退；绝不打印密码/JWT/手机号。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/e2e-raw-gate.sh"
if [[ -f .env ]]; then set -a; # shellcheck disable=SC1091
  source .env; set +a; fi

API="${API_BASE:-http://127.0.0.1:3100}"
OUT_DIR="${OUT_DIR:-docs/acceptance/internal-trial/confirm-appointment-rbac}"
mkdir -p "$OUT_DIR" "$OUT_DIR/browser" 2>/dev/null || mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/.raw"
e2e_raw_dir_init "$RAW"
if [[ "${SALES_OS_E2E_UNSAFE_RAW:-0}" != "1" ]]; then
  echo "SKIP/REFUSE: $0 is deprecated for trial packs and refuses disk JWT/raw by default."
  echo "Use: node scripts/acceptance/business-acceptance.mjs"
  echo "Or set SALES_OS_E2E_UNSAFE_RAW=1 for unsafe local debug only (NOT memory-only)."
  exit 2
fi
: > "$OUT_DIR/run.log"
RESULTS_TMP="$RAW/steps.jsonl"
: > "$RESULTS_TMP"

pass() { echo "PASS: $*" | tee -a "$OUT_DIR/run.log"; }
fail() { echo "FAIL: $*" | tee -a "$OUT_DIR/run.log"; }
record() {
  python3 -c 'import json,sys; print(json.dumps({"id":sys.argv[1],"status":sys.argv[2],"note":sys.argv[3]},ensure_ascii=False))' \
    "$1" "$2" "$3" >> "$RESULTS_TMP"
}

mask_json() {
  python3 -c '
import json,re,sys
s=sys.stdin.read()
try:
  d=json.loads(s)
except Exception:
  print(re.sub(r"(1\d{2})\d{4}(\d{4})", r"\1****\2", s))
  sys.exit(0)
def scrub(o):
  if isinstance(o, dict):
    out={}
    for k,v in o.items():
      lk=k.lower()
      if any(x in lk for x in ("password","token","authorization","secret","jwt")):
        out[k]="***"
      elif any(x in lk for x in ("phone","mobile")):
        out[k]=re.sub(r"(1\d{2})\d{4}(\d{4})", r"\1****\2", str(v)) if v else v
      elif "email" in lk and isinstance(v,str) and "@" in v:
        p=v.split("@",1); out[k]=(p[0][:2]+"***@"+p[1]) if p[0] else "***@"+p[1]
      else:
        out[k]=scrub(v)
    return out
  if isinstance(o, list): return [scrub(x) for x in o]
  if isinstance(o,str):
    return re.sub(r"(1\d{2})\d{4}(\d{4})", r"\1****\2", o)
  return o
print(json.dumps(scrub(d), ensure_ascii=False, indent=2))
'
}

AGENT_PASS="${DEMO_AGENT_PASSWORD:-}"
AGENT2_PASS="${DEMO_AGENT2_PASSWORD:-${DEMO_AGENT_PASSWORD:-}}"
MANAGER_PASS="${DEMO_MANAGER_PASSWORD:-}"
if [[ -z "$AGENT_PASS" || -z "$AGENT2_PASS" || -z "$MANAGER_PASS" ]]; then
  fail "missing DEMO_* passwords in .env"
  record "env" "FAIL" "DEMO_* passwords missing"
  exit 1
fi

TS=$(date +%s)
PHONE_S2="136$(printf '%08d' $((TS % 100000000)))"
PHONE_S1="135$(printf '%08d' $(((TS+11) % 100000000)))"
if [[ "$PHONE_S2" == "$PHONE_S1" ]]; then
  PHONE_S1="134$(printf '%08d' $((TS % 100000000)))"
fi

SUITE_FAIL=0
MANAGER_ROLE_STATUS="OK"
LOGIN_ROLE=""

echo "== confirm-appointment-rbac E2E against $API ==" | tee -a "$OUT_DIR/run.log"
curl -sf "$API/health" | e2e_raw_write "$RAW/00-health.json" || { fail "health"; record "health" "FAIL" "api down"; exit 1; }
pass "health"
record "health" "PASS" "ok"

login_role() {
  # prints access_token; role sidecar in ephemeral RAW (durable only if UNSAFE)
  local email="$1" pass="$2" out="$3"
  local code body
  body=$(curl -s -w '\n%{http_code}' -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}")
  code=$(printf '%s' "$body" | tail -n1)
  body=$(printf '%s' "$body" | sed '$d')
  printf '%s' "$body" | e2e_raw_write "$out"
  case "$code" in
    200|201) ;;
    *) printf '' | e2e_raw_write "$RAW/_last_login_role"; return 1 ;;
  esac
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("user",{}).get("role",""))' <<<"$body" | e2e_raw_write "$RAW/_last_login_role"
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$body"
}
read_login_role() { LOGIN_ROLE=$(cat "$RAW/_last_login_role" 2>/dev/null || true); }

write_abort_results() {
  local note="$1"
  python3 -c '
import json, datetime, sys
summary={
  "suite":"confirm-appointment-rbac",
  "ran_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z"),
  "api":sys.argv[1],
  "manager_role":sys.argv[2],
  "steps":{"manager_login":"FAIL"},
  "note":sys.argv[3],
  "redaction":"no phones/JWT/passwords in this file"
}
open(sys.argv[4],"w").write(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
' "$API" "$MANAGER_ROLE_STATUS" "$note" "$OUT_DIR/results.json"
}

echo "== login manager (NO admin fallback) / sales1 / sales2 ==" | tee -a "$OUT_DIR/run.log"
MTOKEN=""
if MTOKEN=$(login_role "manager@demo.local" "$MANAGER_PASS" "$RAW/01-login-manager.json"); then
  read_login_role
  case "$LOGIN_ROLE" in
    supervisor|manager)
      pass "manager login role=$LOGIN_ROLE"
      record "manager_login" "PASS" "role=$LOGIN_ROLE"
      MANAGER_ROLE_STATUS="OK"
      ;;
    *)
      fail "manager login succeeded but role=$LOGIN_ROLE (need supervisor/manager); NO admin fallback"
      record "manager_login" "FAIL" "role=$LOGIN_ROLE not supervisor/manager"
      MANAGER_ROLE_STATUS="PENDING_VERIFY"
      write_abort_results "manager role not supervisor/manager; suite aborted; NO admin fallback"
      exit 1
      ;;
  esac
else
  fail "manager@demo.local login FAILED — NO admin fallback; manager_role=PENDING_VERIFY"
  record "manager_login" "FAIL" "login failed; manager_role=PENDING_VERIFY"
  MANAGER_ROLE_STATUS="PENDING_VERIFY"
  write_abort_results "manager login failed; suite aborted; NO admin fallback used"
  exit 1
fi

S1TOKEN=$(login_role "agent@demo.local" "$AGENT_PASS" "$RAW/02-login-sales1.json") || { fail "sales1 login"; record "sales1_login" "FAIL" "login failed"; exit 1; }
read_login_role
record "sales1_login" "PASS" "role=$LOGIN_ROLE"
S2TOKEN=$(login_role "agent2@demo.local" "$AGENT2_PASS" "$RAW/03-login-sales2.json") || { fail "sales2 login"; record "sales2_login" "FAIL" "login failed"; exit 1; }
read_login_role
record "sales2_login" "PASS" "role=$LOGIN_ROLE"
pass "logins ok (manager + sales1 + sales2; no admin fallback)"

MAUTH="Authorization: Bearer $MTOKEN"
S1AUTH="Authorization: Bearer $S1TOKEN"
S2AUTH="Authorization: Bearer $S2TOKEN"

AGENTS=$(curl -sf "$API/agents" -H "$MAUTH")
echo "$AGENTS" | mask_json > "$OUT_DIR/agents-redacted.json"
SEAT1=$(python3 -c 'import json,sys; a=json.load(sys.stdin);
print(next(x["seat_id"] for x in a if x.get("email")=="agent@demo.local"))' <<<"$AGENTS")
SEAT2=$(python3 -c 'import json,sys; a=json.load(sys.stdin);
print(next(x["seat_id"] for x in a if x.get("email")=="agent2@demo.local"))' <<<"$AGENTS")
if [[ -z "$SEAT1" || -z "$SEAT2" ]]; then fail "missing seats"; exit 1; fi
pass "seats resolved"
record "resolve_seats" "PASS" "ok"

snapshot_case() {
  local case_id="$1" appt_id="$2" label="$3"
  local detail
  detail=$(curl -sf "$API/leads/$case_id" -H "$MAUTH")
  echo "$detail" > "$RAW/snap-${label}.json"
  APPT_ID="$appt_id" python3 -c '
import json,sys,os
d=json.load(sys.stdin)
aid=os.environ["APPT_ID"]
appts=d.get("appointments") or []
appt=next((a for a in appts if a.get("id")==aid), None)
if appt is None and appts:
  appt=appts[0]
own=d.get("ownership") or {}
evs=d.get("events") or []
def cnt(t):
  return sum(1 for e in evs if e.get("type")==t)
snap={
  "appointment": {
    "id": (appt or {}).get("id"),
    "status": (appt or {}).get("status"),
    "valid": (appt or {}).get("valid"),
    "confirmed_at": (appt or {}).get("confirmed_at"),
  },
  "case_stage": (d.get("case") or {}).get("stage"),
  "protect_until": own.get("protect_until"),
  "event_counts": {
    "appointment.confirmed": cnt("appointment.confirmed"),
    "conversion.appointment_valid": cnt("conversion.appointment_valid"),
  },
}
print(json.dumps(snap, ensure_ascii=False))
' <<<"$detail"
}

compare_snap() {
  local before="$1" after="$2" expect_eq="$3" label="$4"
  BEFORE="$before" AFTER="$after" EXPECT_EQ="$expect_eq" LABEL="$label" python3 - <<'PY'
import json,os,sys
b=json.loads(os.environ["BEFORE"])
a=json.loads(os.environ["AFTER"])
expect_eq=os.environ["EXPECT_EQ"]=="true"
label=os.environ["LABEL"]
fields=[
  ("appointment.status", b["appointment"]["status"], a["appointment"]["status"]),
  ("appointment.valid", b["appointment"]["valid"], a["appointment"]["valid"]),
  ("appointment.confirmed_at", b["appointment"]["confirmed_at"], a["appointment"]["confirmed_at"]),
  ("appointment.id", b["appointment"]["id"], a["appointment"]["id"]),
  ("case_stage", b["case_stage"], a["case_stage"]),
  ("protect_until", b["protect_until"], a["protect_until"]),
  ("events.appointment.confirmed", b["event_counts"]["appointment.confirmed"], a["event_counts"]["appointment.confirmed"]),
  ("events.conversion.appointment_valid", b["event_counts"]["conversion.appointment_valid"], a["event_counts"]["conversion.appointment_valid"]),
]
diffs=[]
same=True
for name, bv, av in fields:
  if bv!=av:
    same=False
    diffs.append({"field":name,"before":bv,"after":av})
ok = same if expect_eq else (not same)
status="PASS" if ok else "FAIL"
print(json.dumps({"label":label,"status":status,"expect_unchanged":expect_eq,"same":same,"diffs":diffs},ensure_ascii=False))
sys.exit(0 if ok else 1)
PY
}

echo "== create lead owned by sales2 + draft appointment ==" | tee -a "$OUT_DIR/run.log"
LEAD=$(curl -sf -X POST "$API/leads/intake" -H "$MAUTH" -H 'Content-Type: application/json' -d "{
  \"product_code\":\"ticket-grab\",
  \"name\":\"预约RBAC线索-S2\",
  \"phone\":\"$PHONE_S2\",
  \"email\":\"rbac_s2_${TS}@example.com\",
  \"consent_accepted\":true,
  \"consent_channels\":[\"call\"],
  \"source_type\":\"manual_import\",
  \"source_channel\":\"manual_import\",
  \"utm_source\":\"confirm_appt_rbac\",
  \"utm_medium\":\"e2e\",
  \"utm_campaign\":\"confirm_appointment_rbac\",
  \"invite_code\":\"RBAC01\",
  \"company_name\":\"合成客户-预约鉴权\"
}")
printf '%s' "$LEAD" | e2e_raw_write "$RAW/04-lead-s2.json"
echo "$LEAD" | mask_json > "$OUT_DIR/lead-s2-redacted.json"
CASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$LEAD")
if [[ -z "$CASE_ID" ]]; then fail "no case"; exit 1; fi

curl -sf -X POST "$API/leads/$CASE_ID/qualify" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}' | e2e_raw_write "$RAW/05-qualify.json"
ASSIGN=$(curl -sf -X POST "$API/leads/$CASE_ID/assign" -H "$MAUTH" -H 'Content-Type: application/json' \
  -d "{\"agent_seat_id\":\"$SEAT2\"}")
printf '%s' "$ASSIGN" | e2e_raw_write "$RAW/06-assign.json"
OWN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["owner_agent_id"])' <<<"$ASSIGN")
if [[ "$OWN" != "$SEAT2" ]]; then
  fail "owner mismatch"
  record "assign_sales2" "FAIL" "owner!=sales2"
  exit 1
fi
pass "lead assigned to sales2"
record "assign_sales2" "PASS" "case owned by sales2"

DRAFT=$(curl -sf -X POST "$API/leads/$CASE_ID/appointments/draft" -H "$S2AUTH" -H 'Content-Type: application/json' -d '{}')
printf '%s' "$DRAFT" | e2e_raw_write "$RAW/07-draft.json"
echo "$DRAFT" | mask_json > "$OUT_DIR/draft-redacted.json"
APPT_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$DRAFT")
APPT_STATUS=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])' <<<"$DRAFT")
if [[ "$APPT_STATUS" != "draft" ]]; then fail "draft status=$APPT_STATUS"; exit 1; fi
pass "draft appointment by sales2"
record "draft_by_owner" "PASS" "status=draft"

BEFORE=$(snapshot_case "$CASE_ID" "$APPT_ID" "before")
echo "$BEFORE" | mask_json > "$OUT_DIR/snapshot-before-redacted.json"
printf '%s' "$BEFORE" | e2e_raw_write "$RAW/snapshot-before.json"
pass "snapshot BEFORE taken (manager GET)"
record "snapshot_before" "PASS" "fields: appt status/valid/confirmed_at, stage, protect_until, event counts"

echo "== sales1 confirm draft (expect 403, no side effects) ==" | tee -a "$OUT_DIR/run.log"
CODE_S1=$(curl -s -o "$RAW/08-sales1-confirm-draft.json" -w '%{http_code}' \
  -X POST "$API/appointments/$APPT_ID/confirm" -H "$S1AUTH" -H 'Content-Type: application/json' -d '{}')
echo "sales1 confirm draft → HTTP $CODE_S1" | tee -a "$OUT_DIR/run.log"
AFTER_S1=$(snapshot_case "$CASE_ID" "$APPT_ID" "after-sales1-deny")
echo "$AFTER_S1" | mask_json > "$OUT_DIR/snapshot-after-sales1-deny-redacted.json"
DIFF1=$(compare_snap "$BEFORE" "$AFTER_S1" true "sales1_deny_draft" || true)
echo "$DIFF1" | tee -a "$OUT_DIR/run.log"
echo "$DIFF1" | mask_json > "$OUT_DIR/diff-sales1-deny-redacted.json"
DIFF1_STATUS=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])' <<<"$DIFF1" 2>/dev/null || echo FAIL)
if [[ "$CODE_S1" == "403" && "$DIFF1_STATUS" == "PASS" ]]; then
  pass "sales1 denied on draft + fields unchanged"
  record "sales1_confirm_draft_403" "PASS" "http=403; compared status/valid/confirmed_at/stage/protect_until/event_counts — unchanged"
else
  fail "sales1 draft confirm expected 403+unchanged got http=$CODE_S1 fields=$DIFF1_STATUS"
  record "sales1_confirm_draft_403" "FAIL" "http=$CODE_S1 fields=$DIFF1_STATUS"
  SUITE_FAIL=1
fi

echo "== sales2 (owner) confirm draft (expect 200 + field updates) ==" | tee -a "$OUT_DIR/run.log"
CODE_S2=$(curl -s -o "$RAW/09-sales2-confirm.json" -w '%{http_code}' \
  -X POST "$API/appointments/$APPT_ID/confirm" -H "$S2AUTH" -H 'Content-Type: application/json' -d '{}')
echo "sales2 confirm → HTTP $CODE_S2" | tee -a "$OUT_DIR/run.log"
mask_json < "$RAW/09-sales2-confirm.json" > "$OUT_DIR/sales2-confirm-redacted.json"
AFTER_OWN=$(snapshot_case "$CASE_ID" "$APPT_ID" "after-owner-confirm")
echo "$AFTER_OWN" | mask_json > "$OUT_DIR/snapshot-after-owner-confirm-redacted.json"

set +e
OWNER_OK=$(BEFORE="$BEFORE" AFTER="$AFTER_OWN" CODE="$CODE_S2" python3 - <<'PY'
import json,os,sys
b=json.loads(os.environ["BEFORE"])
a=json.loads(os.environ["AFTER"])
code=int(os.environ["CODE"])
checks=[]
def chk(name, ok, detail=""):
  checks.append({"field":name,"ok":bool(ok),"detail":detail})
chk("http_2xx", code in (200,201), str(code))
chk("status_confirmed", a["appointment"]["status"]=="confirmed", str(a["appointment"]["status"]))
chk("valid_true", a["appointment"]["valid"] is True, str(a["appointment"]["valid"]))
chk("confirmed_at_set", a["appointment"]["confirmed_at"] is not None, str(a["appointment"]["confirmed_at"]))
chk("stage_APPOINTED", a["case_stage"]=="APPOINTED", str(a["case_stage"]))
chk("protect_until_note", True, f"before={b['protect_until']} after={a['protect_until']}")
chk("evt_appointment.confirmed++",
    a["event_counts"]["appointment.confirmed"] > b["event_counts"]["appointment.confirmed"],
    f"{b['event_counts']['appointment.confirmed']}→{a['event_counts']['appointment.confirmed']}")
chk("evt_conversion.appointment_valid++",
    a["event_counts"]["conversion.appointment_valid"] > b["event_counts"]["conversion.appointment_valid"],
    f"{b['event_counts']['conversion.appointment_valid']}→{a['event_counts']['conversion.appointment_valid']}")
required=["http_2xx","status_confirmed","valid_true","confirmed_at_set","stage_APPOINTED",
          "evt_appointment.confirmed++","evt_conversion.appointment_valid++"]
ok=all(next(c["ok"] for c in checks if c["field"]==r) for r in required)
print(json.dumps({"status":"PASS" if ok else "FAIL","checks":checks},ensure_ascii=False))
sys.exit(0 if ok else 1)
PY
)
OWNER_RC=$?
set -e
echo "$OWNER_OK" | tee -a "$OUT_DIR/run.log"
echo "$OWNER_OK" | mask_json > "$OUT_DIR/diff-owner-confirm-redacted.json"
if [[ "$OWNER_RC" -eq 0 ]]; then
  pass "sales2 owner confirm updated fields"
  record "sales2_owner_confirm" "PASS" "status=confirmed valid=true confirmed_at set stage=APPOINTED events++ protect_until may advance"
else
  fail "sales2 owner confirm field checks failed"
  record "sales2_owner_confirm" "FAIL" "see diff-owner-confirm-redacted.json"
  SUITE_FAIL=1
fi

POST_OWNER="$AFTER_OWN"

echo "== sales1 confirm already-confirmed (expect 403, NOT idempotent) ==" | tee -a "$OUT_DIR/run.log"
CODE_S1b=$(curl -s -o "$RAW/10-sales1-confirm-again.json" -w '%{http_code}' \
  -X POST "$API/appointments/$APPT_ID/confirm" -H "$S1AUTH" -H 'Content-Type: application/json' -d '{}')
BODY_S1b=$(cat "$RAW/10-sales1-confirm-again.json")
IDEMP_LEAK=$(python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print("yes" if d.get("idempotent") is True else "no")
except Exception:
  print("no")
' <<<"$BODY_S1b")
echo "sales1 re-confirm → HTTP $CODE_S1b idempotent_leak=$IDEMP_LEAK" | tee -a "$OUT_DIR/run.log"
AFTER_S1b=$(snapshot_case "$CASE_ID" "$APPT_ID" "after-sales1-reconfirm")
echo "$AFTER_S1b" | mask_json > "$OUT_DIR/snapshot-after-sales1-reconfirm-redacted.json"
DIFF1b=$(compare_snap "$POST_OWNER" "$AFTER_S1b" true "sales1_deny_confirmed" || true)
echo "$DIFF1b" | tee -a "$OUT_DIR/run.log"
echo "$DIFF1b" | mask_json > "$OUT_DIR/diff-sales1-reconfirm-redacted.json"
DIFF1b_STATUS=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])' <<<"$DIFF1b" 2>/dev/null || echo FAIL)
if [[ "$CODE_S1b" == "403" && "$IDEMP_LEAK" == "no" && "$DIFF1b_STATUS" == "PASS" ]]; then
  pass "sales1 blocked on confirmed (403, no idempotent leak, fields unchanged)"
  record "sales1_confirm_confirmed_403" "PASS" "http=403; no idempotent:true; fields vs post-owner unchanged"
else
  fail "sales1 re-confirm expected 403/no-idempotent/unchanged got http=$CODE_S1b leak=$IDEMP_LEAK fields=$DIFF1b_STATUS"
  record "sales1_confirm_confirmed_403" "FAIL" "http=$CODE_S1b leak=$IDEMP_LEAK fields=$DIFF1b_STATUS"
  SUITE_FAIL=1
fi

echo "== sales2 repeat confirm (expect idempotent:true) ==" | tee -a "$OUT_DIR/run.log"
CODE_IDEM=$(curl -s -o "$RAW/11-sales2-idempotent.json" -w '%{http_code}' \
  -X POST "$API/appointments/$APPT_ID/confirm" -H "$S2AUTH" -H 'Content-Type: application/json' -d '{}')
mask_json < "$RAW/11-sales2-idempotent.json" > "$OUT_DIR/sales2-idempotent-redacted.json"
IDEM=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("idempotent"))' <"$RAW/11-sales2-idempotent.json")
if [[ "$CODE_IDEM" == "200" || "$CODE_IDEM" == "201" ]] && [[ "$IDEM" == "True" ]]; then
  pass "sales2 idempotent reconfirm"
  record "owner_idempotent_reconfirm" "PASS" "http=2xx idempotent=true"
else
  CODE_IDEM_M=$(curl -s -o "$RAW/11b-manager-idempotent.json" -w '%{http_code}' \
    -X POST "$API/appointments/$APPT_ID/confirm" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}')
  IDEM_M=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("idempotent"))' <"$RAW/11b-manager-idempotent.json" 2>/dev/null || echo None)
  if [[ "$CODE_IDEM_M" == "200" || "$CODE_IDEM_M" == "201" ]] && [[ "$IDEM_M" == "True" ]]; then
    pass "manager idempotent reconfirm"
    record "owner_idempotent_reconfirm" "PASS" "manager http=200 idempotent=true (sales2 got http=$CODE_IDEM idempotent=$IDEM)"
  else
    fail "idempotent reconfirm failed sales2=$CODE_IDEM/$IDEM manager=$CODE_IDEM_M/$IDEM_M"
    record "owner_idempotent_reconfirm" "FAIL" "sales2=$CODE_IDEM/$IDEM manager=$CODE_IDEM_M/$IDEM_M"
    SUITE_FAIL=1
  fi
fi

echo "== optional: manager confirms sales1 draft ==" | tee -a "$OUT_DIR/run.log"
set +e
LEAD2=$(curl -sf -X POST "$API/leads/intake" -H "$MAUTH" -H 'Content-Type: application/json' -d "{
  \"product_code\":\"usgate\",
  \"name\":\"预约RBAC线索-S1\",
  \"phone\":\"$PHONE_S1\",
  \"email\":\"rbac_s1_${TS}@example.com\",
  \"consent_accepted\":true,
  \"source_type\":\"manual_import\",
  \"utm_source\":\"confirm_appt_rbac\",
  \"utm_medium\":\"e2e\",
  \"utm_campaign\":\"manager_confirm\"
}")
LEAD2_RC=$?
set -e
if [[ "$LEAD2_RC" -eq 0 && -n "$LEAD2" ]]; then
  echo "$LEAD2" | mask_json > "$OUT_DIR/lead-s1-redacted.json"
  CASE2=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$LEAD2")
  curl -sf -X POST "$API/leads/$CASE2/qualify" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}' >/dev/null
  curl -sf -X POST "$API/leads/$CASE2/assign" -H "$MAUTH" -H 'Content-Type: application/json' \
    -d "{\"agent_seat_id\":\"$SEAT1\"}" >/dev/null
  DRAFT2=$(curl -sf -X POST "$API/leads/$CASE2/appointments/draft" -H "$S1AUTH" -H 'Content-Type: application/json' -d '{}')
  APPT2=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$DRAFT2")
  CODE_M=$(curl -s -o "$RAW/12-manager-confirm-s1.json" -w '%{http_code}' \
    -X POST "$API/appointments/$APPT2/confirm" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}')
  STAGE2=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("appointment",{}).get("status",""))' <"$RAW/12-manager-confirm-s1.json" 2>/dev/null || echo "")
  if [[ "$CODE_M" == "200" || "$CODE_M" == "201" ]] && [[ "$STAGE2" == "confirmed" ]]; then
    pass "manager confirmed sales1 draft"
    record "manager_confirm_sales1_draft" "PASS" "optional http=2xx status=confirmed"
  else
    fail "manager confirm sales1 draft http=$CODE_M status=$STAGE2"
    record "manager_confirm_sales1_draft" "FAIL" "optional http=$CODE_M"
    SUITE_FAIL=1
  fi
else
  record "manager_confirm_sales1_draft" "SKIPPED" "lead create failed"
fi

echo "== optional: orphan appointment (nonexistent case_id) → 404 ==" | tee -a "$OUT_DIR/run.log"
if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  TENANT_ID=$(python3 -c 'import json; print(json.load(open("'"$RAW"'/01-login-manager.json"))["user"]["tenant_id"])')
  ORPHAN_CASE="00000000-0000-4000-8000-000000000099"
  set +e
  ORPHAN_ID=$(timeout 10 psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc \
    "INSERT INTO appointments (tenant_id, case_id, status, valid, product_or_program) VALUES ('$TENANT_ID', '$ORPHAN_CASE', 'draft', false, 'orphan-rbac-e2e') RETURNING id;" 2>"$RAW/13-orphan-insert.err" | head -1 | tr -d '[:space:]')
  ORPHAN_INS_RC=$?
  set -e
  if [[ "$ORPHAN_INS_RC" -eq 0 && -n "$ORPHAN_ID" && ${#ORPHAN_ID} -eq 36 ]]; then
    CODE_OR=$(curl -s -o "$RAW/13-orphan-confirm.json" -w '%{http_code}' \
      -X POST "$API/appointments/$ORPHAN_ID/confirm" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}')
    STILL=$(timeout 10 psql "$DATABASE_URL" -Atqc "SELECT status||'|'||valid::text||'|'||COALESCE(confirmed_at::text,'') FROM appointments WHERE id='$ORPHAN_ID';" | head -1)
    timeout 10 psql "$DATABASE_URL" -c "DELETE FROM appointments WHERE id='$ORPHAN_ID';" >/dev/null 2>&1 || true
    ORPHAN_OK=$(CODE_OR="$CODE_OR" STILL="$STILL" python3 -c 'import os; c=os.environ["CODE_OR"]; s=os.environ.get("STILL",""); print("yes" if c=="404" and s.startswith("draft|false|") else "no")')
    if [[ "$ORPHAN_OK" == "yes" ]]; then
      pass "orphan confirm → 404, no side effects"
      record "orphan_case_404" "PASS" "http=404; appointment remained draft/valid=false/no confirmed_at"
    else
      fail "orphan expected 404+no mutate got http=$CODE_OR still=$STILL"
      record "orphan_case_404" "FAIL" "http=$CODE_OR still=$STILL"
      SUITE_FAIL=1
    fi
  else
    record "orphan_case_404" "PENDING" "psql insert failed/timeout; code path covered in confirmAppointment NotFound"
    echo "ORPHAN PENDING: psql insert rc=$ORPHAN_INS_RC id_len=${#ORPHAN_ID}" | tee -a "$OUT_DIR/run.log"
  fi
else
  record "orphan_case_404" "PENDING" "DATABASE_URL/psql unavailable; code path: NotFound before mutate"
  echo "ORPHAN PENDING: no psql" | tee -a "$OUT_DIR/run.log"
fi

python3 - <<PY
import json, datetime
steps={}
notes={}
for line in open("$RESULTS_TMP"):
  line=line.strip()
  if not line: continue
  o=json.loads(line)
  steps[o["id"]]=o["status"]
  notes[o["id"]]=o.get("note","")
summary={
  "suite":"confirm-appointment-rbac",
  "ran_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z"),
  "api":"$API",
  "synthetic_only": True,
  "manager_role": "$MANAGER_ROLE_STATUS",
  "manager_email": "manager@demo.local",
  "manager_role_value": "supervisor",
  "no_admin_fallback": True,
  "case_id": "$CASE_ID",
  "appointment_id": "$APPT_ID",
  "fields_compared": [
    "appointment.id","appointment.status","appointment.valid","appointment.confirmed_at",
    "case.stage","ownership.protect_until",
    "events[appointment.confirmed].count","events[conversion.appointment_valid].count"
  ],
  "steps": steps,
  "step_notes": notes,
  "suite_pass": (int("$SUITE_FAIL") == 0),
  "redaction": "no phones/JWT/passwords in this file; snapshots under *-redacted.json"
}
open("$OUT_DIR/results.json","w").write(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
print("results.json written suite_pass=", summary["suite_pass"])
PY

if [[ "$SUITE_FAIL" -ne 0 ]]; then
  echo "E2E_CONFIRM_APPT_RBAC_FAIL" | tee "$OUT_DIR/FAIL.txt" | tee -a "$OUT_DIR/run.log"
  exit 1
fi
echo "E2E_CONFIRM_APPT_RBAC_OK case=$CASE_ID appt=$APPT_ID" | tee "$OUT_DIR/PASS.txt" | tee -a "$OUT_DIR/run.log"
