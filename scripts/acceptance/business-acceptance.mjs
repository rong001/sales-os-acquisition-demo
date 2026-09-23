#!/usr/bin/env node
/**
 * Business acceptance harness (Node 20+/24, Windows PowerShell 5.1-friendly via node.exe).
 *
 * - Credentials ONLY from repo-root .env.native (never echoed).
 * - JWT / sensitive bodies kept in memory only; never written to disk; never printed.
 * - PASS / FAIL / SKIP layering — OVERALL=PASS only if fail_count=0 and required tiers passed.
 * - Real public-source imports (authorized API) hard-separated from synthetic_fixture sales fixtures.
 * - Due reminders: honest future→past wall-clock crossing (or SKIP); list-polling only (not worker push).
 * - Fault recovery: wrong-port classification for THIS project's API (never Sub2API).
 * - No outbound email/SMS/phone/DM/purchase.
 * - NOT a claim of typed browser UI PASS.
 *
 * Usage:
 *   node scripts/acceptance/business-acceptance.mjs
 *   node scripts/acceptance/business-acceptance.mjs --base http://127.0.0.1:19280
 *
 * Env:
 *   SALES_OS_ACCEPTANCE_BASE
 *   SALES_OS_ACCEPTANCE_RESTART_CMD   optional Stop→Start; if unset → SKIP (not PASS)
 *   SALES_OS_ACCEPTANCE_SKIP_FETCH=1 skip live official fetch inside import API
 *   SALES_OS_ACCEPTANCE_DUE_WAIT_MS  default 2500; set 0 to SKIP wall-clock crossing
 *   SALES_OS_ACCEPTANCE_OUT          evidence dir
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(ROOT, '.env.native');
const SAMPLES_FILE = path.join(__dirname, 'public-company-samples.json');
const OUT_DIR = process.env.SALES_OS_ACCEPTANCE_OUT
  || path.join(ROOT, 'docs/acceptance/internal-trial/SALES-FOLLOWUP-20260923-1152');

const PACK = 'SALES-FOLLOWUP-20260923-1152';

function parseDotEnv(filePath) {
  const map = Object.create(null);
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[k] = v;
  }
  return map;
}

/** @type {{alias:string,status:string,tier:string,note:string}[]} */
const results = [];
const REQUIRED_TIERS = new Set(['required']);

function record(alias, ok, note = '', { soft = false, tier = 'required' } = {}) {
  let status;
  if (soft) status = 'SKIP';
  else status = ok ? 'PASS' : 'FAIL';
  results.push({ alias, status, tier, note: String(note).slice(0, 280) });
  console.log(`${status} ${alias}${note ? ` — ${note}` : ''}`);
  return status === 'PASS';
}

function skip(alias, note, tier = 'optional') {
  return record(alias, false, note, { soft: true, tier });
}

function failHard(msg) {
  console.error(`FAIL harness-abort — ${msg}`);
  process.exit(1);
}

async function api(base, method, p, { token, body } = {}) {
  const url = `${base}${p.startsWith('/') ? p : `/${p}`}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return {
      status: 0,
      json: null,
      bytes: 0,
      error: String(e.name || e.message || e).slice(0, 120),
      classify: 'connection_error',
    };
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  // Intentionally drop `text` from return — keep sensitive bodies out of later dumps
  return { status: res.status, json, bytes: text.length, classify: 'http' };
}

async function login(base, email, password) {
  const r = await api(base, 'POST', '/api/auth/login', { body: { email, password } });
  if (r.status !== 200 && r.status !== 201) {
    return { ok: false, status: r.status, token: null, role: null };
  }
  const token = r.json?.access_token || null;
  const role = r.json?.user?.role || null;
  return { ok: !!token, status: r.status, token, role, email };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tcpProbe(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* */ }
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true, classify: 'tcp_open' }));
    socket.once('timeout', () => finish({ ok: false, classify: 'tcp_timeout' }));
    socket.once('error', (e) => finish({
      ok: false,
      classify: e.code === 'ECONNREFUSED' ? 'ECONNREFUSED' : `tcp_error:${e.code || e.message}`,
    }));
    socket.connect(port, host);
  });
}

function parseArgs(argv) {
  const out = { base: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base' && argv[i + 1]) out.base = argv[++i];
  }
  return out;
}

function loadSamples() {
  const raw = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
  return raw.samples || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(ENV_FILE)) {
    failHard(`missing ${ENV_FILE} — copy scripts/windows/native/.env.native.example or run Start-InternalTrial-Native.ps1`);
  }
  const envMap = parseDotEnv(ENV_FILE);
  for (const k of ['DEMO_MANAGER_PASSWORD', 'DEMO_AGENT_PASSWORD', 'DEMO_AGENT2_PASSWORD']) {
    if (!envMap[k] || envMap[k] === 'CHANGE_ME') {
      failHard(`${k} missing/CHANGE_ME in .env.native (value not printed)`);
    }
  }

  const webPort = envMap.NATIVE_WEB_PORT || '19280';
  const apiPort = Number(envMap.NATIVE_API_PORT || '39300');
  const redisPort = Number(envMap.NATIVE_REDIS_PORT || '56380');
  const pgPort = Number(envMap.NATIVE_PG_PORT || '55433');
  let base = (args.base || process.env.SALES_OS_ACCEPTANCE_BASE || `http://127.0.0.1:${webPort}`).replace(/\/$/, '');
  const useProxyPath = !/:(39300|3100)(\/|$)/.test(base);
  const pfx = useProxyPath ? '/api' : '';

  console.log(`== business-acceptance pack=${PACK} base=${base} proxy=${useProxyPath} ==`);
  console.log('(credentials from .env.native; secrets never printed; JWT memory-only)');
  console.log('UI_PENDING: typed browser login / list UI — NOT tested by this harness');

  // --- tier: required health + auth ---
  const healthPath = useProxyPath ? '/api/health' : '/health';
  const health = await api(base, 'GET', healthPath);
  if (!record('health', health.status === 200 && health.json?.ok === true && health.json?.service === 'sales-os-api', `HTTP ${health.status}`)) {
    failHard('stack not healthy');
  }

  const mgr = await login(base, 'manager@demo.local', envMap.DEMO_MANAGER_PASSWORD);
  const s1 = await login(base, 'agent@demo.local', envMap.DEMO_AGENT_PASSWORD);
  const s2 = await login(base, 'agent2@demo.local', envMap.DEMO_AGENT2_PASSWORD);
  record('login-manager', mgr.ok && (mgr.role === 'supervisor' || mgr.role === 'manager'), `HTTP ${mgr.status} role=${mgr.role || 'none'}`);
  record('login-sales1', s1.ok, s1.ok ? 'ok' : `HTTP ${s1.status}`);
  record('login-sales2', s2.ok, s2.ok ? 'ok' : `HTTP ${s2.status}`);
  if (!mgr.ok || !s1.ok || !s2.ok) failHard('required logins failed');

  const anon = await api(base, 'GET', `${pfx}/workbench/today`);
  record('neg-anon-401', anon.status === 401 || anon.status === 403, `HTTP ${anon.status}`);
  const bad = await login(base, 'manager@demo.local', 'definitely-wrong-password-xx');
  record('neg-wrong-password-401', !bad.ok && (bad.status === 401 || bad.status === 403), `HTTP ${bad.status}`);

  const agentsRes = await api(base, 'GET', `${pfx}/agents`, { token: mgr.token });
  const agents = Array.isArray(agentsRes.json) ? agentsRes.json : [];
  const seat1 = agents.find((a) => a.email === 'agent@demo.local')?.seat_id;
  const seat2 = agents.find((a) => a.email === 'agent2@demo.local')?.seat_id;
  if (!record('resolve-seats', !!seat1 && !!seat2, `seats=${seat1 && seat2 ? 2 : 0}`)) failHard('seats missing');

  // --- 1) Real public-source import via authorized API (NOT synthetic) ---
  const samples = loadSamples();
  const skipFetch = process.env.SALES_OS_ACCEPTANCE_SKIP_FETCH === '1';
  const importBody = {
    fetch_official: !skipFetch,
    batch_label: PACK,
    items: samples.map((s) => ({
      company_name: s.company_name,
      official_site_url: s.official_site_url,
      product_code: s.product_code,
      match_reason_vs_icp: s.match_reason_vs_icp,
      contact_person: 'UNKNOWN',
      demand: 'UNKNOWN',
      consent_status: 'UNKNOWN',
    })),
  };

  // Auth failure must NOT silently fall back to anonymous public intake
  const unauthImport = await api(base, 'POST', `${pfx}/leads/import/authorized-public-list`, {
    body: importBody,
  });
  record(
    'import-auth-required',
    unauthImport.status === 401 || unauthImport.status === 403,
    `no-token HTTP ${unauthImport.status} (must not fall back anonymous)`,
  );

  const importRes = await api(base, 'POST', `${pfx}/leads/import/authorized-public-list`, {
    token: mgr.token,
    body: importBody,
  });
  const importedItems = Array.isArray(importRes.json?.items) ? importRes.json.items : [];
  const realImported = importedItems.filter((x) => x.source_type === 'authorized_public_list_import');
  record(
    'import-authorized-public',
    importRes.status < 300 && realImported.length >= 3,
    importRes.status < 300
      ? `count=${realImported.length} batch=${importRes.json?.batch_id || '?'}`
      : `HTTP ${importRes.status}`,
  );

  // Provenance honesty: UNKNOWN fields, no invented consent
  const provenanceOk = realImported.length > 0 && realImported.every(
    (x) => x.consent_status === 'UNKNOWN'
      && x.contact_person === 'UNKNOWN'
      && x.demand === 'UNKNOWN'
      && x.official_site_url
      && x.fetch_time
      && x.match_reason_vs_icp,
  );
  record(
    'import-provenance-unknowns',
    provenanceOk,
    provenanceOk ? 'contact/demand/consent=UNKNOWN; URL+fetch_time+ICP present' : 'provenance gap',
  );

  // Product codes aligned to enterprise AI lines
  const productOk = realImported.every((x) => ['ai-cs', 'kb-crm', 'sales-agent'].includes(x.product_code));
  record('import-enterprise-products', productOk, productOk ? 'ai-cs|kb-crm|sales-agent' : 'legacy product codes present');

  // --- Synthetic fixtures (explicit) for pipeline / isolation / win-lose ---
  const ts = Date.now();
  async function createSynthetic(label, productCode, phoneSuffix) {
    const r = await api(base, 'POST', `${pfx}/leads/intake`, {
      token: mgr.token,
      body: {
        name: `SYNTHETIC_FIXTURE ${label}`,
        phone: `139${String(phoneSuffix).slice(-8)}`,
        email: `synthetic-${label}-${ts}@demo.local`,
        company_name: `SYNTHETIC fixture ${label} (NOT public acquisition)`,
        product_code: productCode,
        source_type: 'synthetic_fixture',
        source_channel: 'synthetic_fixture',
        consent_accepted: true,
        utm_source: 'synthetic_fixture',
        utm_campaign: PACK,
        raw: { label: 'SYNTHETIC_FIXTURE', demo_not_customer_deal: true },
      },
    });
    return { status: r.status, caseId: r.json?.case?.id, merged: !!r.json?.merged };
  }

  const synA = await createSynthetic('A', 'sales-agent', `${ts}01`);
  const synB = await createSynthetic('B', 'kb-crm', `${ts}02`);
  record('synthetic-fixture-a', !!synA.caseId, synA.caseId ? `alias=${synA.caseId.slice(0, 8)}` : `HTTP ${synA.status}`);
  record('synthetic-fixture-b', !!synB.caseId, synB.caseId ? `alias=${synB.caseId.slice(0, 8)}` : `HTTP ${synB.status}`);
  if (!synA.caseId || !synB.caseId) failHard('synthetic fixtures required for pipeline');

  // Hard separation check: real imported cases must not be labeled synthetic
  const realCaseId = realImported[0]?.case_id;
  if (realCaseId) {
    const realCase = await api(base, 'GET', `${pfx}/leads/${realCaseId}`, { token: mgr.token });
    const flags = realCase.json?.case?.flags || {};
    const srcType = flags.source_type || realCase.json?.source?.type;
    record(
      'real-vs-synthetic-separation',
      flags.real_public_source === true && srcType === 'authorized_public_list_import',
      `real flags.source_type=${srcType || 'n/a'}`,
    );
  } else {
    skip('real-vs-synthetic-separation', 'no real import to compare', 'optional');
  }

  // Dedupe on synthetic email re-intake
  const dup = await api(base, 'POST', `${pfx}/leads/intake`, {
    token: mgr.token,
    body: {
      name: 'SYNTHETIC_FIXTURE A',
      phone: `139${String(`${ts}01`).slice(-8)}`,
      email: `synthetic-A-${ts}@demo.local`,
      company_name: 'SYNTHETIC fixture A (NOT public acquisition)',
      product_code: 'sales-agent',
      source_type: 'synthetic_fixture',
      consent_accepted: true,
      utm_source: 'synthetic_fixture',
      utm_campaign: PACK,
      raw: { label: 'SYNTHETIC_FIXTURE', dedupe_probe: true },
    },
  });
  record('normalize-dedupe', dup.status < 300 && !!dup.json?.merged, `merged=${!!dup.json?.merged} HTTP ${dup.status}`);

  // Qualify + assign synthetics (they have consent)
  await api(base, 'POST', `${pfx}/leads/${synA.caseId}/qualify`, { token: mgr.token, body: {} });
  await api(base, 'POST', `${pfx}/leads/${synB.caseId}/qualify`, { token: mgr.token, body: {} });
  const asA = await api(base, 'POST', `${pfx}/leads/${synA.caseId}/assign`, {
    token: mgr.token, body: { agent_seat_id: seat1 },
  });
  const asB = await api(base, 'POST', `${pfx}/leads/${synB.caseId}/assign`, {
    token: mgr.token, body: { agent_seat_id: seat2 },
  });
  record('assign-manager', asA.status < 300 && asA.json?.case?.owner_agent_id === seat1, 'A→sales1');
  record('assign-manager-b', asB.status < 300 && asB.json?.case?.owner_agent_id === seat2, 'B→sales2');

  // Isolation: HTTP status + structure
  const leak = await api(base, 'GET', `${pfx}/leads/${synB.caseId}`, { token: s1.token });
  record('agent-isolation', leak.status === 403, `sales1→sales2 case HTTP ${leak.status}`);

  const wb1 = await api(base, 'GET', `${pfx}/workbench/today`, { token: s1.token });
  const wbStructOk = wb1.status === 200
    && wb1.json
    && typeof wb1.json === 'object'
    && Array.isArray(wb1.json.cases)
    && wb1.json.stats
    && typeof wb1.json.stats === 'object';
  const leakedInWb = (wb1.json?.cases || []).some(
    (c) => c.id === synB.caseId && c.owner_agent_id === seat2,
  );
  record(
    'agent-isolation-workbench',
    wbStructOk && !leakedInWb,
    wbStructOk ? (leakedInWb ? 'LEAK' : `HTTP 200 structure ok cases=${wb1.json.cases.length}`) : `bad structure HTTP ${wb1.status}`,
  );

  const beforeOver = await api(base, 'GET', `${pfx}/leads/${synB.caseId}`, { token: mgr.token });
  const stageBefore = beforeOver.json?.case?.stage;
  const overreach = await api(base, 'POST', `${pfx}/leads/${synB.caseId}/mark-result`, {
    token: s1.token, body: { result: 'won', note: 'OVERREACH_SHOULD_FAIL' },
  });
  const afterOver = await api(base, 'GET', `${pfx}/leads/${synB.caseId}`, { token: mgr.token });
  record(
    'neg-overreach-no-write',
    (overreach.status === 403 || overreach.status === 401) && afterOver.json?.case?.stage === stageBefore,
    `HTTP ${overreach.status} stage_unchanged=${afterOver.json?.case?.stage === stageBefore}`,
  );

  // --- 2) Due reminders: future → past wall-clock crossing ---
  const dueWaitMs = Number(process.env.SALES_OS_ACCEPTANCE_DUE_WAIT_MS ?? '2500');
  let dueCaseId = synA.caseId;
  if (!Number.isFinite(dueWaitMs) || dueWaitMs <= 0) {
    skip(
      'due-reminder-wallclock',
      'SKIP: SALES_OS_ACCEPTANCE_DUE_WAIT_MS<=0; environment declined wait. Mechanism=list polling / workbench query only (NOT worker timed push).',
      'optional',
    );
    skip('due-reminder-no-duplicate-after-handle', 'skipped with wallclock', 'optional');
    skip('due-reminder-dual-sales-isolation', 'skipped with wallclock', 'optional');
  } else {
    const futureIso = new Date(Date.now() + dueWaitMs).toISOString();
    const act = await api(base, 'POST', `${pfx}/leads/${dueCaseId}/activities`, {
      token: s1.token,
      body: {
        kind: 'note',
        body: 'acceptance follow-up note (no outbound)',
        next_follow_at: futureIso,
        meta: { channel: 'in_app', source: 'acceptance_harness', mechanism: 'list_polling' },
      },
    });
    record('follow-set-future', act.status < 300, `HTTP ${act.status} future=+${dueWaitMs}ms`);

    // Not due yet
    const dueBefore = await api(base, 'GET', `${pfx}/workbench/due-follow-ups`, { token: s1.token });
    const hitBefore = (Array.isArray(dueBefore.json) ? dueBefore.json : []).some((x) => x.case_id === dueCaseId);
    // brief wait past the wall clock
    await sleep(dueWaitMs + 400);
    const dueAfter = await api(base, 'GET', `${pfx}/workbench/due-follow-ups`, { token: s1.token });
    const dueList = Array.isArray(dueAfter.json) ? dueAfter.json : [];
    const hitAfter = dueList.some((x) => x.case_id === dueCaseId);
    record(
      'due-reminder-wallclock',
      !hitBefore && hitAfter,
      `honesty=future→past wall-clock crossing; mechanism=list_polling/workbench_query_only (NOT worker timed push); before=${hitBefore} after=${hitAfter}`,
    );

    // Dual sales isolation on due list
    const dueS2 = await api(base, 'GET', `${pfx}/workbench/due-follow-ups`, { token: s2.token });
    const dueS2List = Array.isArray(dueS2.json) ? dueS2.json : [];
    const leakDue = dueS2List.some((x) => x.case_id === dueCaseId);
    // Also set a due on B for sales2 and ensure sales1 doesn't see it
    const futureB = new Date(Date.now() - 1000).toISOString();
    await api(base, 'POST', `${pfx}/leads/${synB.caseId}/activities`, {
      token: s2.token,
      body: {
        kind: 'note',
        body: 'sales2 due note',
        next_follow_at: futureB,
        meta: { channel: 'in_app', source: 'acceptance_harness' },
      },
    });
    const dueS1b = await api(base, 'GET', `${pfx}/workbench/due-follow-ups`, { token: s1.token });
    const dueS1List = Array.isArray(dueS1b.json) ? dueS1b.json : [];
    const leakB = dueS1List.some((x) => x.case_id === synB.caseId);
    record(
      'due-reminder-dual-sales-isolation',
      !leakDue && !leakB,
      `s2_sees_s1_due=${leakDue} s1_sees_s2_due=${leakB}`,
    );

    // Mark completed → no duplicate due
    const handled = await api(base, 'POST', `${pfx}/leads/${dueCaseId}/follow-up/handle`, {
      token: s1.token, body: {},
    });
    const dueAfterHandle = await api(base, 'GET', `${pfx}/workbench/due-follow-ups`, { token: s1.token });
    const stillDue = (Array.isArray(dueAfterHandle.json) ? dueAfterHandle.json : []).some(
      (x) => x.case_id === dueCaseId,
    );
    record(
      'due-reminder-no-duplicate-after-handle',
      handled.status < 300 && !stillDue,
      `handled HTTP ${handled.status} still_due=${stillDue}`,
    );
  }

  // --- Opportunity win/lose on SYNTHETIC only; never claim 客户成交 ---
  const win = await api(base, 'POST', `${pfx}/leads/${synA.caseId}/mark-result`, {
    token: s1.token,
    body: { result: 'won', note: 'acceptance synthetic demo win — NOT customer 成交' },
  });
  const lose = await api(base, 'POST', `${pfx}/leads/${synB.caseId}/mark-result`, {
    token: s2.token,
    body: { result: 'lost', note: 'acceptance synthetic demo lost' },
  });
  const winFlags = win.json?.case?.flags || {};
  record(
    'opportunity-win-synthetic',
    win.status < 300 && win.json?.case?.stage === 'WON' && winFlags.demo_not_customer_deal === true,
    `stage=${win.json?.case?.stage} demo_not_customer_deal=${winFlags.demo_not_customer_deal}`,
  );
  record('opportunity-lose-synthetic', lose.status < 300 && lose.json?.case?.stage === 'LOST', `stage=${lose.json?.case?.stage}`);

  // Real public import must NOT be auto-marked WON/成交
  if (realCaseId) {
    const rc = await api(base, 'GET', `${pfx}/leads/${realCaseId}`, { token: mgr.token });
    record(
      'real-import-not-won-as-deal',
      rc.json?.case?.stage !== 'WON',
      `real stage=${rc.json?.case?.stage} (must not invent 成交)`,
    );
  }

  const funnel = await api(base, 'GET', `${pfx}/admin/funnel`, { token: mgr.token });
  record('manager-funnel', funnel.status < 300 && !!(funnel.json?.funnel || funnel.json?.stages), `HTTP ${funnel.status}`);
  const mgrCaseA = await api(base, 'GET', `${pfx}/leads/${synA.caseId}`, { token: mgr.token });
  record('manager-board-read', mgrCaseA.status < 300 && mgrCaseA.json?.case?.stage === 'WON', 'manager sees synthetic WON');

  // --- Persistence: restart cmd → real assert; else honest SKIP ---
  const snapStage = mgrCaseA.json?.case?.stage;
  const snapOwner = mgrCaseA.json?.case?.owner_agent_id;
  const restartCmd = process.env.SALES_OS_ACCEPTANCE_RESTART_CMD || '';
  let persistMode = 'relogin_same_process';
  if (restartCmd) {
    persistMode = 'restart_cmd';
    console.log('== running SALES_OS_ACCEPTANCE_RESTART_CMD (secrets not echoed) ==');
    const rr = spawnSync(restartCmd, { shell: true, cwd: ROOT, env: process.env, stdio: 'ignore' });
    record('persist-restart-cmd', rr.status === 0, `exit=${rr.status}`, { tier: 'optional' });
    const h2 = await api(base, 'GET', healthPath);
    record('persist-health-after', h2.status === 200 && h2.json?.ok === true, `HTTP ${h2.status}`);
  } else {
    skip(
      'persist-restart-cmd',
      'SKIP: SALES_OS_ACCEPTANCE_RESTART_CMD not set. Full Stop→Start cited to Windows user PASS (prior followups); bot verifies re-login same-process only.',
      'optional',
    );
  }

  const mgr2 = await login(base, 'manager@demo.local', envMap.DEMO_MANAGER_PASSWORD);
  const after = await api(base, 'GET', `${pfx}/leads/${synA.caseId}`, { token: mgr2.token });
  const persistOk =
    after.status < 300
    && after.json?.case?.stage === snapStage
    && after.json?.case?.owner_agent_id === snapOwner;
  record(
    'business-persistence-relogin',
    persistOk,
    `mode=${persistMode} stage=${after.json?.case?.stage} owner_match=${after.json?.case?.owner_agent_id === snapOwner}`,
  );

  // --- 5) Isolated fault + recovery (THIS project only; never Sub2API 15432/16379) ---
  const sub2apiPorts = [15432, 16379];
  const faultNotes = [];
  // Wrong API port simulation
  const wrongApi = apiPort + 7777;
  const wrongBase = `http://127.0.0.1:${wrongApi}`;
  const faultHit = await api(wrongBase, 'GET', '/health');
  const faultClassOk = faultHit.status === 0 && faultHit.classify === 'connection_error';
  record(
    'fault-api-wrong-port',
    faultClassOk,
    `classify=${faultHit.classify || faultHit.error || 'n/a'} port=${wrongApi}`,
    { tier: 'optional' },
  );
  faultNotes.push(`API wrong-port ${wrongApi}: ${faultHit.classify || faultHit.error}`);

  // Redis / PG TCP probe on configured native ports + a wrong port (no stop/start of shared services)
  const redisProbe = await tcpProbe('127.0.0.1', redisPort);
  const pgProbe = await tcpProbe('127.0.0.1', pgPort);
  const wrongRedisPort = redisPort + 1111;
  const wrongRedis = await tcpProbe('127.0.0.1', wrongRedisPort);
  // On bot host native ports may be closed (Linux compose uses 5432/6379). Soft SKIP if closed.
  if (!redisProbe.ok && !pgProbe.ok) {
    skip(
      'fault-native-redis-pg-ports',
      `SKIP: native redis:${redisPort} classify=${redisProbe.classify}, pg:${pgPort} classify=${pgProbe.classify} (not listening on this host). Wrong-port redis ${wrongRedisPort}=${wrongRedis.classify}. Did NOT stop any service; Sub2API ${sub2apiPorts.join('/')} untouched.`,
      'optional',
    );
    faultNotes.push('native redis/pg ports not listening on this host — wrong-port simulation only');
  } else {
    record(
      'fault-native-redis-pg-ports',
      redisProbe.ok || pgProbe.ok,
      `redis:${redisPort}=${redisProbe.classify} pg:${pgPort}=${pgProbe.classify} wrongRedis:${wrongRedisPort}=${wrongRedis.classify}`,
      { tier: 'optional' },
    );
    faultNotes.push(`redis ${redisPort}=${redisProbe.classify}; pg ${pgPort}=${pgProbe.classify}; wrongRedis=${wrongRedis.classify}`);
  }

  // Recovery: healthy base still works after fault probes
  const recovered = await api(base, 'GET', healthPath);
  record(
    'fault-recovery-health',
    recovered.status === 200 && recovered.json?.ok === true,
    `after wrong-port probes, health HTTP ${recovered.status}; Sub2API ports ${sub2apiPorts.join('/')} never operated`,
  );
  faultNotes.push('recovery: healthy /health re-checked; no Sub2API ops; no redis/pg stop on shared bot');

  // UI pending — always SKIP tier, never PASS
  skip(
    'ui-typed-browser-login',
    '本侧 UI 未测: typed browser password login + list UI isolation. API login ≠ UI. Codex/user must verify on Windows.',
    'ui_pending',
  );

  // --- Summary / OVERALL ---
  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIP');
  const requiredFailed = results.filter((r) => r.status === 'FAIL' && REQUIRED_TIERS.has(r.tier));
  const requiredSkipped = results.filter((r) => r.status === 'SKIP' && REQUIRED_TIERS.has(r.tier));
  // Required items must not be SKIP (soft only allowed on optional/ui_pending)
  const overallPass = failed.length === 0 && requiredSkipped.length === 0;
  const overall = overallPass ? 'PASS' : 'FAIL';

  const summary = {
    suite: 'business-acceptance',
    pack: PACK,
    ran_at: new Date().toISOString(),
    base,
    host_note: 'bot-or-local; NOT a claim of Windows browser UI PASS',
    overall,
    overall_rule: 'PASS only if fail_count=0 AND no required-tier SKIP; optional/ui_pending SKIP allowed',
    fail_count: failed.length,
    skip_count: skipped.length,
    pass_count: results.filter((r) => r.status === 'PASS').length,
    required_fail_count: requiredFailed.length,
    required_skip_count: requiredSkipped.length,
    real_public_imports: realImported.map((x) => ({
      alias: String(x.case_id).slice(0, 8),
      company: x.company_name,
      source_type: x.source_type,
      official_site_url: x.official_site_url,
      fetch_time: x.fetch_time,
      consent_status: x.consent_status,
      contact_person: x.contact_person,
      demand: x.demand,
      product_code: x.product_code,
    })),
    synthetic_fixtures: [
      { alias: synA.caseId.slice(0, 8), source_type: 'synthetic_fixture', role: 'pipeline A' },
      { alias: synB.caseId.slice(0, 8), source_type: 'synthetic_fixture', role: 'pipeline B' },
    ],
    due_reminder_honesty:
      'Mechanism = workbench list polling / due-follow-ups query only. NOT worker timed push/delivery. Wall-clock future→past crossing when DUE_WAIT_MS>0.',
    fault_recovery_tested: faultNotes,
    ui_pending: [
      'typed browser login (manager/agent/agent2) from .env.native — no token injection',
      'list UI isolation visible',
      'authorized-public-import form visible for manager',
      'wrong password UI + logged-out redirect',
    ],
    assertions: results,
    redaction: 'no JWT/passwords/raw API bodies/customer detail dumps in this file',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, 'business-acceptance-results.json');
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2) + '\n');
  console.log(`wrote ${outFile}`);
  console.log(`OVERALL ${summary.overall} (fail=${failed.length} skip=${skipped.length} required_skip=${requiredSkipped.length})`);
  if (skipped.length) {
    console.log('SKIP_LIST ' + skipped.map((s) => s.alias).join(','));
  }
  process.exit(overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FAIL harness-exception —', String(e.message || e).slice(0, 200));
  process.exit(1);
});
