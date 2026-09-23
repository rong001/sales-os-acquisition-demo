#!/usr/bin/env bash
# DEPRECATED for trial packs — use scripts/acceptance/business-acceptance.mjs
# Raw JWT dumps OFF by default; SALES_OS_E2E_UNSAFE_RAW=1 to opt in.
# 跨时点作战台到期跟进：设定一次 next_follow_at（未来 25–40s），浏览器停留 / 不改时间不手动刷新，到期后自动出现。
# 强制 manager@demo.local；不打印密码/JWT/手机明文。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/e2e-raw-gate.sh"
if [[ -f .env ]]; then set -a; # shellcheck disable=SC1091
  source .env; set +a; fi

API="${API_BASE:-http://127.0.0.1:3100}"
GW="${GATEWAY_BASE:-http://127.0.0.1:18180}"
OUT_DIR="${OUT_DIR:-docs/acceptance/internal-trial/followup-live-poll}"
POLL_MS="${POLL_MS:-5000}"
DELAY_SEC="${FOLLOWUP_DELAY_SEC:-35}"
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
PHONE="134$(printf '%08d' $((TS % 100000000)))"

echo "== followup-live-poll E2E against $API gw=$GW delay=${DELAY_SEC}s poll=${POLL_MS}ms ==" | tee -a "$OUT_DIR/run.log"
curl -sf "$API/health" | e2e_raw_write "$RAW/00-health.json" || { fail "health"; exit 1; }
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

echo "== login manager (no admin fallback) ==" | tee -a "$OUT_DIR/run.log"
if ! MTOKEN=$(login "manager@demo.local" "$MANAGER_PASS" "$RAW/01-login-manager.json"); then
  fail "manager login failed"
  record "manager_login" "FAIL" "failed"
  exit 1
fi
MROLE=$(python3 -c 'import json; print(json.load(open("'"$RAW"'/01-login-manager.json")).get("user",{}).get("role",""))')
if [[ "$MROLE" != "supervisor" && "$MROLE" != "manager" ]]; then
  fail "manager role=$MROLE"
  exit 1
fi
pass "manager login role=$MROLE"
record "manager_login" "PASS" "role=$MROLE"

S1TOKEN=$(login "agent@demo.local" "$AGENT_PASS" "$RAW/02-login-sales1.json") || { fail "sales1"; exit 1; }
S2TOKEN=$(login "agent2@demo.local" "$AGENT2_PASS" "$RAW/03-login-sales2.json") || { fail "sales2"; exit 1; }
pass "sales1+sales2 login"
MAUTH="Authorization: Bearer $MTOKEN"
S1AUTH="Authorization: Bearer $S1TOKEN"
S2AUTH="Authorization: Bearer $S2TOKEN"

AGENTS=$(curl -sf "$API/agents" -H "$MAUTH")
echo "$AGENTS" | mask_json > "$OUT_DIR/agents-redacted.json"
SEAT1=$(python3 -c 'import json,sys; a=json.load(sys.stdin);
print(next(x["seat_id"] for x in a if x.get("email")=="agent@demo.local"))' <<<"$AGENTS")

echo "== intake → qualify → assign sales1 ==" | tee -a "$OUT_DIR/run.log"
LEAD=$(curl -sf -X POST "$API/leads/intake" -H "$MAUTH" -H 'Content-Type: application/json' -d "{
  \"product_code\":\"ticket-grab\",
  \"name\":\"跨时点跟进合成线索\",
  \"phone\":\"$PHONE\",
  \"consent_accepted\":true,
  \"source_type\":\"manual_import\",
  \"utm_source\":\"followup_live_poll_e2e\",
  \"utm_medium\":\"script\",
  \"utm_campaign\":\"cross_time\"
}")
printf '%s' "$LEAD" | e2e_raw_write "$RAW/04-lead.json"
echo "$LEAD" | mask_json > "$OUT_DIR/lead-redacted.json"
CASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["case"]["id"])' <<<"$LEAD")
curl -sf -X POST "$API/leads/$CASE_ID/qualify" -H "$MAUTH" -H 'Content-Type: application/json' -d '{}' | e2e_raw_write "$RAW/05-qualify.json"
ASSIGN=$(curl -sf -X POST "$API/leads/$CASE_ID/assign" -H "$MAUTH" -H 'Content-Type: application/json' \
  -d "{\"agent_seat_id\":\"$SEAT1\"}")
printf '%s' "$ASSIGN" | e2e_raw_write "$RAW/06-assign.json"
pass "case assigned case=$CASE_ID"
record "assign" "PASS" "sales1"

# Set next_follow_at ONCE to now + DELAY_SEC — never change again
NEXT_FOLLOW_AT=$(DELAY_SEC="$DELAY_SEC" python3 -c 'from datetime import datetime,timedelta,timezone; import os; d=int(os.environ["DELAY_SEC"]); print((datetime.now(timezone.utc)+timedelta(seconds=d)).isoformat().replace("+00:00","Z"))')
SET_AT=$(python3 -c 'from datetime import datetime,timezone; print(datetime.now(timezone.utc).isoformat().replace("+00:00","Z"))')
echo "== set NEXT_FOLLOW_AT once=$NEXT_FOLLOW_AT (never change again) ==" | tee -a "$OUT_DIR/run.log"
ACT=$(curl -sf -X POST "$API/leads/$CASE_ID/activities" -H "$S1AUTH" -H 'Content-Type: application/json' -d "{
  \"kind\":\"note\",
  \"body\":\"跨时点跟进：仅设定一次，等待墙上时钟到期\",
  \"next_follow_at\":\"$NEXT_FOLLOW_AT\"
}")
printf '%s' "$ACT" | e2e_raw_write "$RAW/07-act-once.json"
echo "$ACT" | mask_json > "$OUT_DIR/activity-once-redacted.json"
CASE_SNAP=$(curl -sf "$API/leads/$CASE_ID" -H "$S1AUTH")
echo "$CASE_SNAP" | mask_json > "$OUT_DIR/case-after-set-redacted.json"
STORED=$(python3 -c 'import json,sys; c=json.load(sys.stdin)["case"]; print(c.get("next_follow_at"))' <<<"$CASE_SNAP")
echo "stored next_follow_at=$STORED" | tee -a "$OUT_DIR/run.log"
record "set_once" "PASS" "$NEXT_FOLLOW_AT"

# API sanity: not due yet
WB0=$(curl -sf "$API/workbench/today" -H "$S1AUTH")
echo "$WB0" | mask_json > "$OUT_DIR/sales1-api-before-due-redacted.json"
CASE_ID="$CASE_ID" python3 -c '
import json,os,sys
wb=json.load(sys.stdin)
cid=os.environ["CASE_ID"]
due=wb.get("due_follow_ups") or []
if any(x.get("case_id")==cid for x in due):
    sys.exit("FAIL: already due before wall clock")
print("api before-due ok")
' <<<"$WB0" || { fail "already due"; exit 1; }
pass "API before-due: not in list"
record "api_before" "PASS" "ok"

# sales2 API check during future window
WB2A=$(curl -sf "$API/workbench/today" -H "$S2AUTH")
echo "$WB2A" | mask_json > "$OUT_DIR/sales2-api-before-redacted.json"

echo "== browser live poll (no reload, no timestamp edit) ==" | tee -a "$OUT_DIR/run.log"
S1_USER_JSON=$(python3 -c 'import json; u=json.load(open("'"$RAW"'/02-login-sales1.json"))["user"]; print(json.dumps(u,ensure_ascii=False))')
S2_USER_JSON=$(python3 -c 'import json; u=json.load(open("'"$RAW"'/03-login-sales2.json"))["user"]; print(json.dumps(u,ensure_ascii=False))')
export GATEWAY_BASE="$GW" CASE_ID NEXT_FOLLOW_AT OUT_DIR POLL_MS
export SALES1_TOKEN="$S1TOKEN" SALES1_USER_JSON="$S1_USER_JSON"
export SALES2_TOKEN="$S2TOKEN" SALES2_USER_JSON="$S2_USER_JSON"
export CHROME_PATH="${CHROME_PATH:-/usr/bin/google-chrome-stable}"

# Resolve puppeteer-core from web workspace
NODE_PATH="$ROOT/apps/web/node_modules${NODE_PATH:+:$NODE_PATH}"
export NODE_PATH
if ! node "$ROOT/scripts/browser-followup-live-poll.mjs" > "$RAW/browser-stdout.json" 2>"$RAW/browser-stderr.txt"; then
  fail "browser script failed"
  record "browser" "FAIL" "see .raw/browser-stderr.txt"
  tail -n 40 "$RAW/browser-stderr.txt" | tee -a "$OUT_DIR/run.log" || true
  exit 1
fi
pass "browser live poll"
record "browser" "PASS" "before/after/handled"

# Merge results
python3 - << PY
import json, datetime, os
from pathlib import Path
out = Path("$OUT_DIR")
raw = out / ".raw"
steps = []
p = raw / "steps.jsonl"
if p.exists():
    for line in p.read_text().splitlines():
        if line.strip():
            steps.append(json.loads(line))
browser_meta = {}
bm = out / "browser" / "browser-meta.json"
if bm.exists():
    browser_meta = json.loads(bm.read_text())
results = {
    "suite": "followup-live-poll",
    "ran_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
    "poll_ms": int("$POLL_MS"),
    "delay_sec": int("$DELAY_SEC"),
    "case_id": "$CASE_ID",
    "set_at": "$SET_AT",
    "next_follow_at": "$NEXT_FOLLOW_AT",
    "stored_next_follow_at": "$STORED",
    "before_shot_at": browser_meta.get("before_shot_at"),
    "after_shot_at": browser_meta.get("after_shot_at"),
    "handled_at": browser_meta.get("handled_click_at") or browser_meta.get("handled_verify_at"),
    "sales2_check_at": browser_meta.get("sales2_check_at"),
    "before_item_visible": browser_meta.get("before_item_visible"),
    "after_item_visible": browser_meta.get("after_item_visible"),
    "sales2_item_visible": browser_meta.get("sales2_item_visible"),
    "handled_gone": browser_meta.get("handled_gone"),
    "browser_path": browser_meta.get("browser") or os.environ.get("CHROME_PATH"),
    "gateway": "$GW",
    "note": "next_follow_at set once; wall clock crossed; no manual reload; no timestamp flip",
    "steps": steps,
    "overall": "PASS" if browser_meta.get("after_item_visible") and browser_meta.get("handled_gone") and not browser_meta.get("sales2_item_visible") and not browser_meta.get("before_item_visible") else "FAIL",
}
(out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
print("overall", results["overall"])
if results["overall"] != "PASS":
    raise SystemExit(1)
PY

cat > "$OUT_DIR/E2E.md" << 'MD'
# 跨时点到期跟进（作战台自动刷新）— E2E

> 合成账号；密码仅从本地 `.env` 的 `DEMO_*` 读取。  
> 自动化：`npm run e2e:followup-live`（`scripts/e2e-followup-live-poll.sh` + `scripts/browser-followup-live-poll.mjs`）。  
> **禁止**把 `next_follow_at` 从未来改成过去当作「自动出现」证据——本套件只设定一次，等待墙上时钟越过后再断言。

## 证明点

1. sales1/manager 建案并分配 sales1，**仅一次**设定 `next_follow_at = now + ~30s`。
2. 真实浏览器（本机 Chrome / puppeteer-core）登录 sales1，停留在 `/` **不手动刷新**。
3. 到期前截图：该案不在「到期跟进」。
4. 墙上时钟 > `next_follow_at` + 一轮轮询后截图：该案出现（依赖 WorkbenchView 5s 轮询）。
5. 同期 sales2 作战台不见该项。
6. sales1 点「已处理」后，后续轮询不再出现。

## 产物

- `results.json`：`set_at` / `next_follow_at` / `before_shot_at` / `after_shot_at` / `handled_at`
- `browser/sales1-workbench-before-due.png` / `sales1-workbench-after-due.png` / `sales2-workbench-same-period.png` / `sales1-workbench-after-handled.png`
- `.raw/`：含 JWT，已 gitignore

## 浏览器路径

`/login` → `/`（今日作战台）→「到期跟进」→「已处理」
MD

pass "results written"
echo "DONE $OUT_DIR" | tee -a "$OUT_DIR/run.log"
