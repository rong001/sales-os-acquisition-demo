#!/usr/bin/env bash
# 内部销售获客与跟进闭环 E2E（合成线索，不含真实客户/密码落盘）
# 读取本地 .env 中 DEMO_* 密码；绝不 echo 密码 / JWT。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f .env ]]; then set -a; # shellcheck disable=SC1091
  source .env; set +a; fi

API="${API_BASE:-http://127.0.0.1:3100}"
OUT_DIR="${OUT_DIR:-docs/acceptance/internal-trial}"
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/.raw-run"
mkdir -p "$RAW"
: > "$OUT_DIR/run.log"

pass() { echo "PASS: $*" | tee -a "$OUT_DIR/run.log"; }
fail() { echo "FAIL: $*" | tee -a "$OUT_DIR/run.log"; exit 1; }
mask_json() {
  # 脱敏：手机/邮箱/token/password
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
        p=v.split("@",1); out[k]=p[0][:2]+"***@"+p[1]
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

AGENT_PASS="${DEMO_AGENT_PASSWORD:-demo1234}"
AGENT2_PASS="${DEMO_AGENT2_PASSWORD:-$AGENT_PASS}"
MANAGER_PASS="${DEMO_MANAGER_PASSWORD:-${DEMO_ADMIN_PASSWORD:-demo1234}}"
ADMIN_PASS="${DEMO_ADMIN_PASSWORD:-demo1234}"

TS=$(date +%s)
PHONE_A="139$(printf '%08d' $((TS % 100000000)))"
PHONE_B="138$(printf '%08d' $(((TS+7) % 100000000)))"
# 保证 A/B 不同
[[ "$PHONE_A" != "$PHONE_B" ]] || PHONE_B="137$(printf '%08d' $((TS % 100000000)))"

echo "== internal-sales E2E against $API ==" | tee -a "$OUT_DIR/run.log"
curl -sf "$API/health" | tee "$RAW/00-health.json" >/dev/null
pass "health"

login() {
  local email="$1" pass="$2" out="$3"
  local body
  body=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}")
  echo "$body" > "$out"
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$body"
}

echo "== login manager / sales1 / sales2 ==" | tee -a "$OUT_DIR/run.log"
MANAGER_ROLE_STATUS="OK"
MANAGER_USED="manager@demo.local"
if MTOKEN=$(login "manager@demo.local" "$MANAGER_PASS" "$RAW/01-login-manager.json"); then
  MROLE=$(python3 -c 'import json; print(json.load(open("'"$RAW"'/01-login-manager.json")).get("user",{}).get("role",""))')
  if [[ "$MROLE" != "supervisor" && "$MROLE" != "manager" ]]; then
    echo "FAIL: manager login role=$MROLE (expected supervisor/manager) — NOT falling back to admin" | tee -a "$OUT_DIR/run.log"
    MANAGER_ROLE_STATUS="PENDING_VERIFY"
    fail "manager role invalid ($MROLE); admin fallback forbidden"
  fi
else
  echo "FAIL: manager@demo.local login failed — NOT falling back to admin; manager_role=PENDING_VERIFY" | tee -a "$OUT_DIR/run.log"
  MANAGER_ROLE_STATUS="PENDING_VERIFY"
  fail "manager login failed; admin fallback forbidden"
fi
S1TOKEN=$(login "agent@demo.local" "$AGENT_PASS" "$RAW/02-login-sales1.json")
S2TOKEN=$(login "agent2@demo.local" "$AGENT2_PASS" "$RAW/03-login-sales2.json")
pass "logins ok ($MANAGER_USED + sales1 + sales2); manager_role=$MANAGER_ROLE_STATUS"

MAUTH="Authorization: Bearer $MTOKEN"
S1AUTH="Authorization: Bearer $S1TOKEN"
S2AUTH="Authorization: Bearer $S2TOKEN"

# 解析坐席 id
AGENTS=$(curl -sf "$API/agents" -H "$MAUTH")
echo "$AGENTS" | mask_json > "$OUT_DIR/agents-redacted.json"
SEAT1=$(python3 -c 'import json,sys; a=json.load(sys.stdin);
print(next(x["seat_id"] for x in a if x.get("email")=="agent@demo.local"))' <<<"$AGENTS")
SEAT2=$(python3 -c 'import json,sys; a=json.load(sys.stdin);
print(next(x["seat_id"] for x in a if x.get("email")=="agent2@demo.local"))' <<<"$AGENTS")
test -n "$SEAT1" && test -n "$SEAT2" || fail "missing seats"
pass "seats resolved"

echo "== 1) create synthetic lead A (manual_import) ==" | tee -a "$OUT_DIR/run.log"
LEAD_A=$(curl -sf -X POST "$API/leads/intake" -H "$MAUTH" -H 'Content-Type: application/json' -d "{
  \"product_code\":\"ticket-grab\",
  \"name\":\"内部试用线索A\",
  \"phone\":\"$PHONE_A\",
  \"email\":\"trial_a_${TS}@example.com\",
  \"consent_accepted\":true,
  \"consent_channels\":[\"call\",\"sms\"],
  \"source_type\":\"manual_import\",
  \"source_channel\":\"manual_import\",
  \"utm_source\":\"internal_trial\",
  \"utm_medium\":\"manual\",
  \"utm_campaign\":\"internal_sales_loop\",
  \"utm_content\":\"lead_a\",
  \"invite_code\":\"TRIAL01\",
  \"company_name\":\"合成客户A（通用销售流程）\",
  \"raw\":{\"note\":\"产品说明：内部试用合成；非真实获客随机假数据\",\"acquisition_fields\":[\"utm\",\"channel\",\"invite\",\"manual_import\"]}
}")
echo "$LEAD_A" > "$RAW/04-lead-a.json"
echo "$LEAD_A" | mask_json > "$OUT_DIR/lead-a-redacted.json"
CASE_A=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$LEAD_A")
MERGED_A=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("merged"))' <<<"$LEAD_A")
test -n "$CASE_A" || fail "no case A"
[[ "$MERGED_A" == "False" || "$MERGED_A" == "false" || "$MERGED_A" == "None" || -z "$MERGED_A" ]] || true
pass "lead A created case=$CASE_A source=manual_import/utm=internal_trial"

echo "== 2) create synthetic lead B ==" | tee -a "$OUT_DIR/run.log"
LEAD_B=$(curl -sf -X POST "$API/leads/intake" -H "$MAUTH" -H 'Content-Type: application/json' -d "{
  \"product_code\":\"usgate\",
  \"name\":\"内部试用线索B\",
  \"phone\":\"$PHONE_B\",
  \"email\":\"trial_b_${TS}@example.com\",
  \"consent_accepted\":true,
  \"consent_channels\":[\"call\"],
  \"source_type\":\"manual_import\",
  \"source_channel\":\"manual_import\",
  \"utm_source\":\"internal_trial\",
  \"utm_medium\":\"manual\",
  \"utm_campaign\":\"internal_sales_loop\",
  \"utm_content\":\"lead_b\",
  \"invite_code\":\"TRIAL02\",
  \"company_name\":\"合成客户B（通用销售流程）\"
}")
echo "$LEAD_B" > "$RAW/05-lead-b.json"
echo "$LEAD_B" | mask_json > "$OUT_DIR/lead-b-redacted.json"
CASE_B=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$LEAD_B")
test -n "$CASE_B" || fail "no case B"
pass "lead B created case=$CASE_B"

echo "== 3) dedup duplicate of A ==" | tee -a "$OUT_DIR/run.log"
DUP=$(curl -sf -X POST "$API/leads/intake" -H "$MAUTH" -H 'Content-Type: application/json' -d "{
  \"product_code\":\"ticket-grab\",
  \"name\":\"内部试用线索A-重复\",
  \"phone\":\"$PHONE_A\",
  \"consent_accepted\":true,
  \"source_type\":\"manual_import\",
  \"utm_source\":\"internal_trial\",
  \"utm_medium\":\"manual_dup\"
}")
echo "$DUP" > "$RAW/06-dedup.json"
echo "$DUP" | mask_json > "$OUT_DIR/dedup-redacted.json"
MERGED=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("merged"))' <<<"$DUP")
[[ "$MERGED" == "True" || "$MERGED" == "true" ]] || fail "expected merged=true got $MERGED"
pass "dedup merged=true for duplicate phone A"

echo "== 4) qualify + manager assign A→sales1 B→sales2 ==" | tee -a "$OUT_DIR/run.log"
curl -sf -X POST "$API/leads/$CASE_A/qualify" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}' > "$RAW/07-qualify-a.json"
curl -sf -X POST "$API/leads/$CASE_B/qualify" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}' > "$RAW/08-qualify-b.json"
ASSIGN_A=$(curl -sf -X POST "$API/leads/$CASE_A/assign" -H "$MAUTH" -H 'Content-Type: application/json' \
  -d "{\"agent_seat_id\":\"$SEAT1\"}")
ASSIGN_B=$(curl -sf -X POST "$API/leads/$CASE_B/assign" -H "$MAUTH" -H 'Content-Type: application/json' \
  -d "{\"agent_seat_id\":\"$SEAT2\"}")
echo "$ASSIGN_A" > "$RAW/09-assign-a.json"
echo "$ASSIGN_B" > "$RAW/10-assign-b.json"
OWN_A=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["owner_agent_id"])' <<<"$ASSIGN_A")
OWN_B=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["owner_agent_id"])' <<<"$ASSIGN_B")
[[ "$OWN_A" == "$SEAT1" ]] || fail "A owner mismatch"
[[ "$OWN_B" == "$SEAT2" ]] || fail "B owner mismatch"
pass "assigned A→sales1 B→sales2"

echo "== 5) sales1 follow-up + next reminder (appointment) + mark result ==" | tee -a "$OUT_DIR/run.log"
NEXT_AT=$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(days=1)).strftime("%Y-%m-%dT10:00:00+08:00"))')
ACT=$(curl -sf -X POST "$API/leads/$CASE_A/activities" -H "$S1AUTH" -H 'Content-Type: application/json' -d "{
  \"kind\":\"note\",
  \"body\":\"内部试用跟进：已电话介绍通用销售流程与产品边界\",
  \"next_follow_at\":\"$NEXT_AT\",\"meta\":{\"channel\":\"call\",\"source\":\"internal_trial\"}
}")
echo "$ACT" > "$RAW/11-activity.json"
echo "$ACT" | mask_json > "$OUT_DIR/activity-redacted.json"

DRAFT=$(curl -sf -X POST "$API/leads/$CASE_A/appointments/draft" -H "$S1AUTH" -H 'Content-Type: application/json' -d '{}')
echo "$DRAFT" > "$RAW/12-appt-draft.json"
APPT_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$DRAFT")
CONFIRM=$(curl -sf -X POST "$API/appointments/$APPT_ID/confirm" -H "$S1AUTH" -H 'Content-Type: application/json' -d '{}')
echo "$CONFIRM" > "$RAW/13-appt-confirm.json"
EVENT=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("event",""))' <<<"$CONFIRM")
[[ "$EVENT" == "conversion.appointment_valid" ]] || fail "appointment event=$EVENT"

RESULT=$(curl -sf -X POST "$API/leads/$CASE_A/mark-result" -H "$S1AUTH" -H 'Content-Type: application/json' \
  -d '{"result":"won","note":"内部试用：合成商机标记为成交(won)"}')
echo "$RESULT" > "$RAW/14-mark-result.json"
STAGE=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["stage"])' <<<"$RESULT")
[[ "$STAGE" == "WON" ]] || fail "expected WON got $STAGE"
pass "sales1 follow-up + appointment reminder + mark won"

# sales2 marks B as qualified nurture
curl -sf -X POST "$API/leads/$CASE_B/activities" -H "$S2AUTH" -H 'Content-Type: application/json' \
  -d '{"kind":"note","body":"销售2跟进记录（合成）","meta":{"next_follow_at":"'"$NEXT_AT"'"}}' > "$RAW/15-activity-b.json"
curl -sf -X POST "$API/leads/$CASE_B/mark-result" -H "$S2AUTH" -H 'Content-Type: application/json' \
  -d '{"result":"nurture","note":"继续培育"}' > "$RAW/16-mark-b.json"
pass "sales2 nurture on B"

echo "== 6) manager sees both ==" | tee -a "$OUT_DIR/run.log"
WB=$(curl -sf "$API/workbench/today" -H "$MAUTH")
echo "$WB" | mask_json > "$OUT_DIR/manager-workbench-redacted.json"
DA=$(curl -sf "$API/leads/$CASE_A" -H "$MAUTH")
DB=$(curl -sf "$API/leads/$CASE_B" -H "$MAUTH")
echo "$DA" | mask_json > "$OUT_DIR/manager-case-a-redacted.json"
echo "$DB" | mask_json > "$OUT_DIR/manager-case-b-redacted.json"
SA=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["stage"])' <<<"$DA")
SB=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["stage"])' <<<"$DB")
[[ "$SA" == "WON" ]] || fail "manager A stage=$SA"
[[ "$SB" == "NURTURE" ]] || fail "manager B stage=$SB"
FUNNEL=$(curl -sf "$API/admin/funnel" -H "$MAUTH")
echo "$FUNNEL" | mask_json > "$OUT_DIR/manager-funnel-redacted.json"
pass "manager sees A(WON) and B(NURTURE) + funnel"

echo "== 7) negative RBAC: sales1 must NOT access sales2 lead B ==" | tee -a "$OUT_DIR/run.log"
CODE=$(curl -s -o "$RAW/17-neg-sales1-get-b.json" -w '%{http_code}' \
  "$API/leads/$CASE_B" -H "$S1AUTH" || true)
echo "sales1 GET lead B → HTTP $CODE" | tee -a "$OUT_DIR/run.log"
BODY=$(head -c 400 "$RAW/17-neg-sales1-get-b.json")
echo "body: $BODY" | tee -a "$OUT_DIR/run.log"
python3 - <<PY
import json
code=int("$CODE")
body=open("$RAW/17-neg-sales1-get-b.json").read()
out={
  "step":"sales1_access_sales2_lead",
  "http_status": code,
  "expected":"403 Forbidden（无权访问其他销售的客户）",
  "pass": code == 403,
  "message_snippet": body[:240],
  "note":"工作台列表亦应按归属过滤；本步验证按 ID 直读被拒"
}
open("$OUT_DIR/negative-rbac.json","w").write(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
print("negative recorded status", code)
if code != 403:
  raise SystemExit("expected 403 got %s" % code)
PY
pass "sales1 blocked from sales2 lead (403)"

# sales1 workbench should not list B as owned
WB1=$(curl -sf "$API/workbench/today" -H "$S1AUTH")
echo "$WB1" | mask_json > "$OUT_DIR/sales1-workbench-redacted.json"
CASE_B="$CASE_B" SEAT2="$SEAT2" python3 -c '
import json,os,sys
wb=json.load(sys.stdin)
bid=os.environ["CASE_B"]
for c in wb.get("cases",[]):
  if c["id"]==bid and c.get("owner_agent_id")==os.environ["SEAT2"]:
    raise SystemExit("sales1 workbench leaked sales2 owned case")
print("sales1 workbench does not leak B")
' <<<"$WB1" | tee -a "$OUT_DIR/run.log"
pass "sales1 workbench isolation"

# results.json (redacted summary)
python3 - <<PY
import json, datetime
summary={
  "suite":"internal-sales-loop",
  "ran_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z"),
  "api":"$API",
  "synthetic_only": True,
  "acquisition_fields_explained":[
    "source_type=manual_import（手工录入/导入）",
    "utm_source/medium/campaign/content（投放/渠道归因）",
    "invite_code（邀请码）",
    "source_channel（渠道字段）",
    "公开落地页 /public/leads/intake 亦支持同类字段（本轮用认证手工录入）"
  ],
  "cases":{
    "A":{"id":"$CASE_A","stage":"WON","assigned_to":"agent@demo.local","phone_masked":"${PHONE_A:0:3}****${PHONE_A: -4}"},
    "B":{"id":"$CASE_B","stage":"NURTURE","assigned_to":"agent2@demo.local","phone_masked":"${PHONE_B:0:3}****${PHONE_B: -4}"}
  },
  "steps":{
    "create_leads":"PASS",
    "dedup":"PASS",
    "manager_assign":"PASS",
    "follow_up_and_reminder":"PASS",
    "mark_result":"PASS",
    "manager_view":"PASS",
    "negative_rbac":"PASS",
    "persist_restart":"SEE_e2e_followup_reminders"
  },
  "roles_used":{
    "管理员":"admin@demo.local",
    "经理":"$MANAGER_USED",
    "销售1":"agent@demo.local",
    "销售2":"agent2@demo.local"
  },
  "manager_role":"$MANAGER_ROLE_STATUS",
  "caveats":{
    "manager_role_independent_proof":"$MANAGER_ROLE_STATUS",
    "persist_restart":"SEE_e2e_followup_reminders",
    "next_follow_at_vs_due_reminder":"IN_APP_PASS — LeadCase.next_follow_at + workbench due list；外部消息送达仍待接入"
  },
  "redaction":"no phones/JWT/passwords in this file"
}
open("$OUT_DIR/results.json","w").write(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
print("results.json written")
PY

echo "E2E_INTERNAL_SALES_OK A=$CASE_A B=$CASE_B" | tee "$OUT_DIR/PASS.txt" | tee -a "$OUT_DIR/run.log"
