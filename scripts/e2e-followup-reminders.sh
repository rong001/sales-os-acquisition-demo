#!/usr/bin/env bash
# DEPRECATED for trial packs — use scripts/acceptance/business-acceptance.mjs
# Raw JWT dumps OFF by default; SALES_OS_E2E_UNSAFE_RAW=1 to opt in.
# 站内到期跟进提醒 E2E：可查询待办 + 作战台可见 + 已处理不再重复 + 重启持久化。
# 强制 manager@demo.local（禁止 admin 回退）。不打印密码/JWT/手机明文。
# 明确范围：站内提醒；外部消息送达仍待接入。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/e2e-raw-gate.sh"
if [[ -f .env ]]; then set -a; # shellcheck disable=SC1091
  source .env; set +a; fi

API="${API_BASE:-http://127.0.0.1:3100}"
GW="${GATEWAY_BASE:-http://127.0.0.1:18180}"
OUT_DIR="${OUT_DIR:-docs/acceptance/internal-trial/followup-reminders}"
mkdir -p "$OUT_DIR" "$OUT_DIR/browser" 2>/dev/null || mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/.raw"
e2e_raw_dir_init "$RAW"
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

assert_due_absent() {
  local file="$1" cid="$2" msg="$3"
  CASE_ID="$cid" WB_FILE="$file" python3 -c '
import json,os,sys
wb=json.load(open(os.environ["WB_FILE"]))
cid=os.environ["CASE_ID"]
due=wb.get("due_follow_ups") or []
if any(x.get("case_id")==cid for x in due):
    sys.exit(1)
print(sys.argv[1])
' "$msg"
}

assert_due_present() {
  local file="$1" cid="$2"
  CASE_ID="$cid" WB_FILE="$file" python3 -c '
import json,os,sys
wb=json.load(open(os.environ["WB_FILE"]))
cid=os.environ["CASE_ID"]
due=wb.get("due_follow_ups") or []
hit=[x for x in due if x.get("case_id")==cid]
if not hit:
    sys.exit(1)
assert hit[0].get("follow_up_status")=="open"
print("due present", hit[0].get("next_follow_at"))
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
PHONE="133$(printf '%08d' $((TS % 100000000)))"
MANAGER_ROLE_STATUS="OK"

echo "== followup-reminders E2E against $API ==" | tee -a "$OUT_DIR/run.log"
curl -sf "$API/health" | e2e_raw_write "$RAW/00-health.json" || { fail "health"; record "health" "FAIL" "api down"; exit 1; }
pass "health"
record "health" "PASS" "ok"

login() {
  local email="$1" pass="$2" out="$3"
  local code body
  body=$(curl -s -w '\n%{http_code}' -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}")
  code=$(printf '%s' "$body" | tail -n1)
  body=$(printf '%s' "$body" | sed '$d')
  printf '%s' "$body" | e2e_raw_write "$out"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    return 1
  fi
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$body"
}

echo "== login manager (FORBIDDEN to fall back to admin) ==" | tee -a "$OUT_DIR/run.log"
if ! MTOKEN=$(login "manager@demo.local" "$MANAGER_PASS" "$RAW/01-login-manager.json"); then
  fail "manager@demo.local login failed — NOT falling back to admin"
  record "manager_login" "FAIL" "manager login failed"
  python3 -c 'import json,datetime; open("'"$OUT_DIR"'/results.json","w").write(json.dumps({"suite":"followup-reminders","ran_at":datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z"),"manager_role":"PENDING_VERIFY","overall":"FAIL","note":"manager login failed; admin fallback forbidden"},ensure_ascii=False,indent=2)+"\n")'
  exit 1
fi
MROLE=$(python3 -c 'import json; print(json.load(open("'"$RAW"'/01-login-manager.json")).get("user",{}).get("role",""))')
if [[ "$MROLE" != "supervisor" && "$MROLE" != "manager" ]]; then
  fail "manager role=$MROLE (expected supervisor/manager)"
  record "manager_login" "FAIL" "role=$MROLE"
  exit 1
fi
pass "manager login role=$MROLE"
record "manager_login" "PASS" "role=$MROLE"

S1TOKEN=$(login "agent@demo.local" "$AGENT_PASS" "$RAW/02-login-sales1.json") || { fail "sales1 login"; exit 1; }
S2TOKEN=$(login "agent2@demo.local" "$AGENT2_PASS" "$RAW/03-login-sales2.json") || { fail "sales2 login"; exit 1; }
pass "sales1+sales2 login"
record "sales_login" "PASS" "ok"

MAUTH="Authorization: Bearer $MTOKEN"
S1AUTH="Authorization: Bearer $S1TOKEN"
S2AUTH="Authorization: Bearer $S2TOKEN"

AGENTS=$(curl -sf "$API/agents" -H "$MAUTH")
echo "$AGENTS" | mask_json > "$OUT_DIR/agents-redacted.json"
SEAT1=$(python3 -c 'import json,sys; a=json.load(sys.stdin);
print(next(x["seat_id"] for x in a if x.get("email")=="agent@demo.local"))' <<<"$AGENTS")
SEAT2=$(python3 -c 'import json,sys; a=json.load(sys.stdin);
print(next(x["seat_id"] for x in a if x.get("email")=="agent2@demo.local"))' <<<"$AGENTS")
test -n "$SEAT1" && test -n "$SEAT2" || { fail "seats"; exit 1; }

echo "== intake → qualify → assign sales1 ==" | tee -a "$OUT_DIR/run.log"
LEAD=$(curl -sf -X POST "$API/leads/intake" -H "$MAUTH" -H 'Content-Type: application/json' -d "{
  \"product_code\":\"ticket-grab\",
  \"name\":\"跟进提醒合成线索\",
  \"phone\":\"$PHONE\",
  \"consent_accepted\":true,
  \"source_type\":\"manual_import\",
  \"utm_source\":\"followup_reminder_e2e\",
  \"utm_medium\":\"script\",
  \"utm_campaign\":\"in_app_due\"
}")
printf '%s' "$LEAD" | e2e_raw_write "$RAW/04-lead.json"
echo "$LEAD" | mask_json > "$OUT_DIR/lead-redacted.json"
CASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$LEAD")
curl -sf -X POST "$API/leads/$CASE_ID/qualify" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}' | e2e_raw_write "$RAW/05-qualify.json"
ASSIGN=$(curl -sf -X POST "$API/leads/$CASE_ID/assign" -H "$MAUTH" -H 'Content-Type: application/json' \
  -d "{\"agent_seat_id\":\"$SEAT1\"}")
printf '%s' "$ASSIGN" | e2e_raw_write "$RAW/06-assign.json"
OWN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["owner_agent_id"])' <<<"$ASSIGN")
[[ "$OWN" == "$SEAT1" ]] || { fail "owner mismatch"; exit 1; }
pass "case assigned to sales1 case=$CASE_ID"
record "assign" "PASS" "sales1"

FUTURE_AT=$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(hours=2)).isoformat().replace("+00:00","Z"))')
BEFORE_SET_AT=$(python3 -c 'from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat().replace("+00:00","Z"))')
echo "== set FUTURE next_follow_at=$FUTURE_AT ==" | tee -a "$OUT_DIR/run.log"
ACT1=$(curl -sf -X POST "$API/leads/$CASE_ID/activities" -H "$S1AUTH" -H 'Content-Type: application/json' -d "{
  \"kind\":\"note\",
  \"body\":\"设定未来跟进（未到期）\",
  \"next_follow_at\":\"$FUTURE_AT\"
}")
printf '%s' "$ACT1" | e2e_raw_write "$RAW/07-act-future.json"
echo "$ACT1" | mask_json > "$OUT_DIR/activity-future-redacted.json"
CASE_F=$(curl -sf "$API/leads/$CASE_ID" -H "$S1AUTH")
echo "$CASE_F" | mask_json > "$OUT_DIR/case-before-due-redacted.json"
NF=$(python3 -c 'import json,sys; c=json.load(sys.stdin)["case"]; print(c.get("next_follow_at"), c.get("follow_up_status"))' <<<"$CASE_F")
echo "case next_follow fields: $NF" | tee -a "$OUT_DIR/run.log"

WB_BEFORE=$(curl -sf "$API/workbench/today" -H "$S1AUTH")
printf '%s' "$WB_BEFORE" | e2e_raw_write "$RAW/08-wb-before.json"
echo "$WB_BEFORE" | mask_json > "$OUT_DIR/sales1-workbench-before-due-redacted.json"
assert_due_absent "$RAW/08-wb-before.json" "$CASE_ID" "before-due ok" \
  || { fail "future follow-up falsely due"; record "before_due" "FAIL" "appeared in due list"; exit 1; }
pass "before due: not in due list"
record "before_due" "PASS" "future next_follow_at excluded"

PAST_AT=$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)-timedelta(minutes=5)).isoformat().replace("+00:00","Z"))')
DUE_SET_AT=$(python3 -c 'from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat().replace("+00:00","Z"))')
echo "== set PAST next_follow_at=$PAST_AT ==" | tee -a "$OUT_DIR/run.log"
ACT2=$(curl -sf -X POST "$API/leads/$CASE_ID/activities" -H "$S1AUTH" -H 'Content-Type: application/json' -d "{
  \"kind\":\"note\",
  \"body\":\"设定已到期跟进\",
  \"next_follow_at\":\"$PAST_AT\",
  \"meta\":{\"channel\":\"call\",\"source\":\"followup_reminder_e2e\"}
}")
printf '%s' "$ACT2" | e2e_raw_write "$RAW/09-act-past.json"
echo "$ACT2" | mask_json > "$OUT_DIR/activity-due-redacted.json"

WB_DUE=$(curl -sf "$API/workbench/today" -H "$S1AUTH")
printf '%s' "$WB_DUE" | e2e_raw_write "$RAW/10-wb-due.json"
echo "$WB_DUE" | mask_json > "$OUT_DIR/sales1-workbench-due-redacted.json"
DUE_LIST=$(curl -sf "$API/workbench/due-follow-ups" -H "$S1AUTH")
printf '%s' "$DUE_LIST" | e2e_raw_write "$RAW/11-due-list.json"
echo "$DUE_LIST" | mask_json > "$OUT_DIR/sales1-due-list-redacted.json"
assert_due_present "$RAW/10-wb-due.json" "$CASE_ID" \
  || { fail "due item missing for owner"; record "after_due" "FAIL" "missing"; exit 1; }
pass "after due: visible on sales1 workbench"
record "after_due" "PASS" "owner sees due item"

WB2=$(curl -sf "$API/workbench/today" -H "$S2AUTH")
printf '%s' "$WB2" | e2e_raw_write "$RAW/12-wb-sales2.json"
echo "$WB2" | mask_json > "$OUT_DIR/sales2-workbench-redacted.json"
assert_due_absent "$RAW/12-wb-sales2.json" "$CASE_ID" "sales2 isolated" \
  || { fail "sales2 leaked due item"; record "isolation" "FAIL" "leak"; exit 1; }
pass "sales2 cannot see sales1 due item"
record "isolation" "PASS" "sales2 isolated"

echo "== restart API/gateway via supervise.sh ==" | tee -a "$OUT_DIR/run.log"
BEFORE_RESTART_AT=$(python3 -c 'from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat().replace("+00:00","Z"))')
bash "$ROOT/scripts/supervise.sh" restart | tee -a "$OUT_DIR/run.log"
for i in $(seq 1 60); do
  if curl -sf "$API/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
curl -sf "$API/health" | e2e_raw_write "$RAW/13-health-after-restart.json" || { fail "health after restart"; exit 1; }
AFTER_RESTART_AT=$(python3 -c 'from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat().replace("+00:00","Z"))')

MTOKEN=$(login "manager@demo.local" "$MANAGER_PASS" "$RAW/14-relogin-manager.json") || { fail "relogin manager"; exit 1; }
S1TOKEN=$(login "agent@demo.local" "$AGENT_PASS" "$RAW/15-relogin-sales1.json") || { fail "relogin sales1"; exit 1; }
MAUTH="Authorization: Bearer $MTOKEN"
S1AUTH="Authorization: Bearer $S1TOKEN"

CASE_AFTER=$(curl -sf "$API/leads/$CASE_ID" -H "$S1AUTH")
printf '%s' "$CASE_AFTER" | e2e_raw_write "$RAW/16-case-after-restart.json"
echo "$CASE_AFTER" | mask_json > "$OUT_DIR/case-after-restart-redacted.json"
WB_AFTER=$(curl -sf "$API/workbench/today" -H "$S1AUTH")
printf '%s' "$WB_AFTER" | e2e_raw_write "$RAW/17-wb-after-restart.json"
echo "$WB_AFTER" | mask_json > "$OUT_DIR/sales1-workbench-after-restart-redacted.json"

CASE_ID="$CASE_ID" SEAT1="$SEAT1" CASE_FILE="$RAW/16-case-after-restart.json" WB_FILE="$RAW/17-wb-after-restart.json" python3 -c '
import json,os,sys
cid=os.environ["CASE_ID"]
c=json.load(open(os.environ["CASE_FILE"]))["case"]
assert c["id"]==cid
assert c.get("owner_agent_id")==os.environ["SEAT1"]
assert c.get("follow_up_status")=="open"
assert c.get("next_follow_at")
wb=json.load(open(os.environ["WB_FILE"]))
due=wb.get("due_follow_ups") or []
if not any(x.get("case_id")==cid for x in due):
    sys.exit(1)
print("persist ok")
' || { fail "persist after restart"; record "persist_restart" "FAIL" "lost"; exit 1; }
pass "restart persistence: open due todo still present"
record "persist_restart" "PASS" "open todo preserved"

echo "== handle follow-up ==" | tee -a "$OUT_DIR/run.log"
HANDLE=$(curl -sf -X POST "$API/leads/$CASE_ID/follow-up/handle" -H "$S1AUTH" -H 'Content-Type: application/json' -d '{}')
printf '%s' "$HANDLE" | e2e_raw_write "$RAW/18-handle.json"
echo "$HANDLE" | mask_json > "$OUT_DIR/handle-redacted.json"
HANDLED_AT=$(python3 -c 'from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat().replace("+00:00","Z"))')

WB_HANDLED=$(curl -sf "$API/workbench/today" -H "$S1AUTH")
printf '%s' "$WB_HANDLED" | e2e_raw_write "$RAW/19-wb-handled.json"
echo "$WB_HANDLED" | mask_json > "$OUT_DIR/sales1-workbench-handled-redacted.json"
CASE_ID="$CASE_ID" HANDLE_FILE="$RAW/18-handle.json" WB_FILE="$RAW/19-wb-handled.json" python3 -c '
import json,os,sys
cid=os.environ["CASE_ID"]
c=json.load(open(os.environ["HANDLE_FILE"]))["case"]
assert c.get("follow_up_status")=="handled"
wb=json.load(open(os.environ["WB_FILE"]))
due=wb.get("due_follow_ups") or []
if any(x.get("case_id")==cid for x in due):
    sys.exit(1)
print("handled ok")
' || { fail "still due after handle"; record "handle" "FAIL" "reappeared"; exit 1; }
pass "handled: no longer in due list"
record "handle" "PASS" "dismissed"

BROWSER_NOTE="skipped"
CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$c" >/dev/null 2>&1; then CHROME=$(command -v "$c"); break; fi
done
if [[ -z "$CHROME" ]]; then
  CHROME=$(ls /usr/bin/google-chrome* /usr/bin/chromium* 2>/dev/null | head -1 || true)
fi
if [[ -n "$CHROME" ]] && { [[ -d "$ROOT/node_modules/puppeteer-core" ]] || [[ -d "$ROOT/node_modules/puppeteer" ]]; }; then
  echo "== browser screenshot workbench ==" | tee -a "$OUT_DIR/run.log"
  if S1TOKEN="$S1TOKEN" GW="$GW" OUT_DIR="$OUT_DIR" CHROME="$CHROME" node <<'NODE'
const fs = require('fs');
const path = require('path');
async function main() {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('puppeteer'); }
  const token = process.env.S1TOKEN;
  const gw = process.env.GW;
  const out = process.env.OUT_DIR;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(gw + '/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate((t) => { localStorage.setItem('salesos_token', t); }, token);
  const me = await page.evaluate(async (t, base) => {
    const r = await fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    return r.json();
  }, token, gw);
  await page.evaluate((u) => {
    localStorage.setItem('salesos_user', JSON.stringify(u.user || u));
  }, me);
  await page.goto(gw + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('[data-testid="due-follow-ups"]', { timeout: 20000 });
  await page.screenshot({ path: path.join(out, 'browser', 'workbench-due-follow.png'), fullPage: true });
  await browser.close();
  console.log('screenshot written');
}
main().catch((e) => { console.error(e); process.exit(1); });
NODE
  then BROWSER_NOTE="ok"; else BROWSER_NOTE="failed"; fi
fi
echo "browser: $BROWSER_NOTE" | tee -a "$OUT_DIR/run.log"

python3 - <<PY
import json, datetime
steps=[]
for line in open("$RESULTS_TMP"):
    line=line.strip()
    if line: steps.append(json.loads(line))
overall = "PASS" if all(s.get("status")=="PASS" for s in steps) else "FAIL"
summary={
  "suite":"followup-reminders",
  "ran_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z"),
  "api":"$API",
  "gateway":"$GW",
  "synthetic_only": True,
  "scope":"站内提醒；外部消息送达仍待接入",
  "manager_role":"$MANAGER_ROLE_STATUS",
  "case_id":"$CASE_ID",
  "owner":"agent@demo.local",
  "timestamps":{
    "before_due_set_at":"$BEFORE_SET_AT",
    "future_next_follow_at":"$FUTURE_AT",
    "due_set_at":"$DUE_SET_AT",
    "past_next_follow_at":"$PAST_AT",
    "before_restart_at":"$BEFORE_RESTART_AT",
    "after_restart_at":"$AFTER_RESTART_AT",
    "handled_at":"$HANDLED_AT"
  },
  "browser_path":"/ （今日作战台）→ 区块「到期跟进」",
  "user_trial_step":"登录 sales1（agent@demo.local）→ 打开作战台 / → 在「到期跟进」看到到期待办 → 点「已处理」后该项消失且刷新不再出现",
  "steps":steps,
  "overall":overall,
  "persist_restart":"PASS",
  "in_app_due_reminder":"PASS",
  "external_delivery":"PENDING — 外部 SMS/Call/Email 仍待接入",
  "redaction":"no phones/JWT/passwords in committed artifacts",
  "browser_screenshot":"$BROWSER_NOTE"
}
open("$OUT_DIR/results.json","w").write(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
print("results.json overall", overall)
if overall!="PASS":
  raise SystemExit(1)
PY

echo "E2E_FOLLOWUP_REMINDERS_OK case=$CASE_ID" | tee "$OUT_DIR/PASS.txt" | tee -a "$OUT_DIR/run.log"
