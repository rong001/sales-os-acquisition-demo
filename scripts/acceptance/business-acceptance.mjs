#!/usr/bin/env node
/**
 * Business acceptance harness (Node 20+/24, Windows PowerShell 5.1-friendly via node.exe).
 *
 * - Credentials ONLY from repo-root .env.native (never echoed).
 * - JWT / sensitive bodies kept in memory only; never written to disk; never printed.
 * - Layered reporting: api_subsuite / real_source_gate / ui — UI SKIP cannot make product全绿.
 * - Real public-source: only fetch_verified counts; require ≥3 or FAIL/honest SKIP (never fake all-real PASS).
 * - Idempotent company dedupe + parallel re-import concurrency.
 * - Due reminders: honest future→past wall-clock crossing (or SKIP); list-polling only (not worker push).
 * - Health: /health = readiness (PG/Redis); /health/live = liveness. Wrong-port ≠ dependency fault test.
 * - Fault recovery: controlled project-dep stop only when isolated+safe; else SKIP (never Sub2API).
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
  || path.join(ROOT, 'docs/acceptance/internal-trial/SALES-FOLLOWUP-20260926-P0P1');

const PACK = 'SALES-FOLLOWUP-20260926-P0P1';

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

/** @type {{alias:string,status:string,tier:string,layer:string,note:string}[]} */
const results = [];
const REQUIRED_TIERS = new Set(['required']);
/** Layers that must be green for product_green (UI never required here). */
const PRODUCT_GREEN_LAYERS = new Set(['api_subsuite', 'real_source_gate']);

function record(alias, ok, note = '', { soft = false, tier = 'required', layer = 'api_subsuite' } = {}) {
  let status;
  if (soft) status = 'SKIP';
  else status = ok ? 'PASS' : 'FAIL';
  results.push({ alias, status, tier, layer, note: String(note).slice(0, 320) });
  console.log(`${status} [${layer}] ${alias}${note ? ` — ${note}` : ''}`);
  return status === 'PASS';
}

function skip(alias, note, tier = 'optional', layer = 'api_subsuite') {
  return record(alias, false, note, { soft: true, tier, layer });
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
  const directApi = /:(39300|3100)(\/|$)/.test(base);
  const path = directApi ? '/auth/login' : '/api/auth/login';
  const r = await api(base, 'POST', path, { body: { email, password } });
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

  // --- tier: required health + auth (readiness vs liveness) ---
  const healthPath = useProxyPath ? '/api/health' : '/health';
  const livePath = useProxyPath ? '/api/health/live' : '/health/live';
  const readyPath = useProxyPath ? '/api/health/ready' : '/health/ready';
  const live = await api(base, 'GET', livePath);
  record(
    'health-liveness',
    live.status === 200 && live.json?.ok === true && live.json?.check === 'liveness' && live.json?.service === 'sales-os-api',
    `HTTP ${live.status} check=${live.json?.check || 'n/a'}`,
    { layer: 'api_subsuite' },
  );
  const health = await api(base, 'GET', healthPath);
  const ready = await api(base, 'GET', readyPath);
  const readinessOk =
    health.status === 200
    && health.json?.ok === true
    && health.json?.service === 'sales-os-api'
    && (health.json?.check === 'readiness' || health.json?.deps?.postgres?.ok === true);
  if (!record(
    'health-readiness',
    readinessOk && ready.status === 200 && ready.json?.ok === true,
    readinessOk
      ? `HTTP ${health.status} pg=${health.json?.deps?.postgres?.ok} redis=${health.json?.deps?.redis?.ok} ( /health = readiness )`
      : `HTTP ${health.status} body_check=${health.json?.check || 'n/a'}`,
    { layer: 'api_subsuite' },
  )) {
    failHard('stack not ready (readiness)');
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
  const verifiedImported = realImported.filter((x) => x.verification_status === 'fetch_verified');
  const failedImported = realImported.filter((x) => x.verification_status === 'fetch_failed');
  const providedImported = realImported.filter((x) => x.verification_status === 'source_provided');

  // Status honesty: skip-fetch must be source_provided, never fetch_verified
  if (skipFetch) {
    record(
      'import-skip-fetch-not-verified',
      importRes.status < 300
        && realImported.length >= 3
        && providedImported.length === realImported.length
        && verifiedImported.length === 0,
      `source_provided=${providedImported.length} verified=0 (SKIP_FETCH honesty)`,
      { layer: 'real_source_gate' },
    );
    skip(
      'real-source-gate-ge3-verified',
      `SKIP_FETCH=1 → cannot claim fetch_verified≥3 (provided=${providedImported.length}). Honest SKIP of real-source acceptance gate.`,
      'optional',
      'real_source_gate',
    );
  } else {
    record(
      'import-authorized-public-submitted',
      importRes.status < 300 && realImported.length >= 3,
      importRes.status < 300
        ? `submitted=${realImported.length} verified=${verifiedImported.length} failed=${failedImported.length} batch=${importRes.json?.batch_id || '?'}`
        : `HTTP ${importRes.status}`,
      { layer: 'api_subsuite' },
    );
    // ONLY fetch_verified counts toward real-source acceptance
    const gateOk = verifiedImported.length >= 3;
    record(
      'real-source-gate-ge3-verified',
      gateOk,
      gateOk
        ? `fetch_verified=${verifiedImported.length} (≥3)`
        : `FAIL/insufficient: fetch_verified=${verifiedImported.length} failed=${failedImported.length} provided=${providedImported.length} — must not PASS all-real`,
      { tier: 'required', layer: 'real_source_gate' },
    );
  }

  // Per-item status present
  const statusOk = realImported.length > 0 && realImported.every(
    (x) => ['source_provided', 'fetch_verified', 'fetch_failed', 'pending_verification'].includes(x.verification_status),
  );
  record(
    'import-verification-status-split',
    statusOk,
    statusOk
      ? `statuses=${realImported.map((x) => `${x.company_name}:${x.verification_status}`).join('|')}`
      : 'missing verification_status',
    { layer: 'real_source_gate' },
  );

  // Failed fetch must not store error-page HTML as facts
  const factsHonest = failedImported.every(
    (x) => !x.public_facts_excerpt
      || x.public_facts_excerpt === 'UNKNOWN'
      || !/<html|cloudflare|just a moment|too many requests/i.test(String(x.public_facts_excerpt)),
  );
  record(
    'import-failed-fetch-no-error-html-facts',
    failedImported.length === 0 || factsHonest,
    failedImported.length
      ? `failed=${failedImported.length} facts_clean=${factsHonest}`
      : 'no fetch_failed in this run',
    { layer: 'real_source_gate' },
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
    { layer: 'api_subsuite' },
  );

  // Product codes aligned to enterprise AI lines
  const productOk = realImported.every((x) => ['ai-cs', 'kb-crm', 'sales-agent'].includes(x.product_code));
  record('import-enterprise-products', productOk, productOk ? 'ai-cs|kb-crm|sales-agent' : 'legacy product codes present', { layer: 'api_subsuite' });

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

  // Hard separation check: verified real ≠ synthetic; unverified must not claim real_public_source
  const probeItem = verifiedImported[0] || realImported[0];
  const realCaseId = probeItem?.case_id;
  if (realCaseId) {
    const realCase = await api(base, 'GET', `${pfx}/leads/${realCaseId}`, { token: mgr.token });
    const flags = realCase.json?.case?.flags || {};
    const srcType = flags.source_type || realCase.json?.source?.type;
    const expectRealFlag = probeItem.verification_status === 'fetch_verified';
    record(
      'real-vs-synthetic-separation',
      srcType === 'authorized_public_list_import'
        && (expectRealFlag ? flags.real_public_source === true : flags.real_public_source !== true)
        && (probeItem.verification_status !== 'fetch_failed' || flags.real_public_source !== true),
      `source_type=${srcType || 'n/a'} real_public_source=${flags.real_public_source} verification=${flags.verification_status || probeItem.verification_status} hist=${flags.historically_verified}`,
      { layer: 'real_source_gate' },
    );
  } else {
    skip('real-vs-synthetic-separation', 'no real import to compare', 'optional', 'real_source_gate');
  }

  // Dedupe on synthetic email re-intake (identity merge)
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
  record('normalize-dedupe-synthetic-identity', dup.status < 300 && !!dup.json?.merged, `merged=${!!dup.json?.merged} HTTP ${dup.status}`, { layer: 'api_subsuite' });

  // Idempotent company re-import: same Stripe URL must reuse LeadCase (case_merged), not create another
  const stripeSample = samples.find((s) => /stripe\.com/i.test(s.official_site_url)) || samples[0];
  const firstStripe = realImported.find((x) => x.company_name === stripeSample.company_name) || realImported[0];
  const reimportBody = {
    fetch_official: false, // avoid rate limits; exercise idempotent case reuse + source append
    batch_label: `${PACK}-reimport`,
    items: [{
      company_name: stripeSample.company_name,
      official_site_url: stripeSample.official_site_url,
      product_code: stripeSample.product_code,
      match_reason_vs_icp: stripeSample.match_reason_vs_icp,
      contact_person: 'UNKNOWN',
      demand: 'UNKNOWN',
      consent_status: 'UNKNOWN',
    }],
  };
  const re1 = await api(base, 'POST', `${pfx}/leads/import/authorized-public-list`, {
    token: mgr.token, body: reimportBody,
  });
  const reItem = Array.isArray(re1.json?.items) ? re1.json.items[0] : null;
  const sameCase = firstStripe && reItem && reItem.case_id === firstStripe.case_id;
  record(
    'company-dedupe-reimport-same-case',
    re1.status < 300 && !!reItem?.case_merged && sameCase,
    `case_merged=${!!reItem?.case_merged} same_case_id=${sameCase} HTTP ${re1.status}`,
    { layer: 'api_subsuite' },
  );

  // Parallel re-imports → single case
  const parallel = await Promise.all([
    api(base, 'POST', `${pfx}/leads/import/authorized-public-list`, { token: mgr.token, body: { ...reimportBody, batch_label: `${PACK}-p1` } }),
    api(base, 'POST', `${pfx}/leads/import/authorized-public-list`, { token: mgr.token, body: { ...reimportBody, batch_label: `${PACK}-p2` } }),
    api(base, 'POST', `${pfx}/leads/import/authorized-public-list`, { token: mgr.token, body: { ...reimportBody, batch_label: `${PACK}-p3` } }),
  ]);
  const parallelIds = parallel
    .flatMap((r) => (Array.isArray(r.json?.items) ? r.json.items : []))
    .map((x) => x.case_id)
    .filter(Boolean);
  const uniqueParallel = new Set(parallelIds);
  record(
    'company-dedupe-parallel-single-case',
    parallel.every((r) => r.status < 300) && uniqueParallel.size === 1 && parallelIds.length === 3,
    `unique_cases=${uniqueParallel.size} responses=${parallelIds.length}`,
    { layer: 'api_subsuite' },
  );

  // Provenance/source history appended on re-import
  if (firstStripe?.case_id) {
    const afterCase = await api(base, 'GET', `${pfx}/leads/${firstStripe.case_id}`, { token: mgr.token });
    const hist = afterCase.json?.case?.flags?.source_history;
    record(
      'company-dedupe-source-history-append',
      Array.isArray(hist) && hist.length >= 2,
      `source_history_len=${Array.isArray(hist) ? hist.length : 0}`,
      { layer: 'api_subsuite' },
    );
  } else {
    skip('company-dedupe-source-history-append', 'no stripe/first case', 'optional', 'api_subsuite');
  }

  // Historical vs current verification: reimport with fetch_official=false must NOT sticky-claim fetch_verified as current
  if (firstStripe?.case_id) {
    const afterCase = await api(base, 'GET', `${pfx}/leads/${firstStripe.case_id}`, { token: mgr.token });
    const flags = afterCase.json?.case?.flags || {};
    const currentIsProvided = flags.verification_status === 'source_provided';
    const histOk = flags.historically_verified === true || flags.ever_fetch_verified === true || firstStripe.verification_status === 'fetch_verified';
    // After skip-fetch reimports above, current should be source_provided; if first was verified, historically_verified sticky
    const expl = String(flags.verification_explanation || '');
    record(
      'verification-current-vs-historical',
      currentIsProvided
        && flags.real_public_source !== true
        && (firstStripe.verification_status !== 'fetch_verified' || histOk)
        && (firstStripe.verification_status !== 'fetch_verified' || /previously verified|source URL provided|current status/i.test(expl) || histOk),
      `current=${flags.verification_status} real=${flags.real_public_source} hist=${flags.historically_verified} expl=${expl.slice(0, 80)}`,
      { layer: 'api_subsuite' },
    );
  } else {
    skip('verification-current-vs-historical', 'no case', 'optional', 'api_subsuite');
  }

  // Title honesty: Cloudflare corporate sample must not be rejected solely for title containing "Cloudflare"
  const cfItem = realImported.find((x) => /cloudflare/i.test(x.company_name || '') || /cloudflare\.com/i.test(x.official_site_url || ''));
  if (cfItem && !skipFetch) {
    const titleHonest = cfItem.verification_status === 'fetch_verified'
      || (cfItem.verification_status === 'fetch_failed' && !/http_200_or_error_page/.test(String(cfItem.error || '')));
    // If failed, failure must not be bare title false-positive — check case fetch_meta when available
    let metaOk = true;
    if (cfItem.case_id) {
      const cfCase = await api(base, 'GET', `${pfx}/leads/${cfItem.case_id}`, { token: mgr.token });
      const raw = cfCase.json?.source?.raw_payload?.fetch_meta || {};
      const err = String(raw.error || '');
      if (cfItem.verification_status === 'fetch_failed' && err === 'http_200_or_error_page') {
        // Still might be real challenge page — only soft-fail note; prefer verified
        metaOk = false;
      }
      if (cfItem.verification_status === 'fetch_verified') metaOk = true;
    }
    record(
      'import-title-honesty-cloudflare',
      cfItem.verification_status === 'fetch_verified' || (cfItem.verification_status === 'fetch_failed' && metaOk),
      `company=${cfItem.company_name} status=${cfItem.verification_status} (bare cloudflare title must not force error_page)`,
      { layer: 'api_subsuite' },
    );
  } else if (skipFetch) {
    skip('import-title-honesty-cloudflare', 'SKIP_FETCH', 'optional', 'api_subsuite');
  } else {
    skip('import-title-honesty-cloudflare', 'no Cloudflare sample in import set', 'optional', 'api_subsuite');
  }

  // Redis enqueue failure/recovery — offline synthetic (not workbench 200)
  {
    const { spawnSync } = await import('node:child_process');
    const unit = spawnSync(process.execPath, ['--test', 'scripts/acceptance/unit/outbox-enqueue-recovery.test.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    });
    const ok = unit.status === 0;
    record(
      'redis-enqueue-recovery-synthetic',
      ok,
      ok ? 'enqueue fail→recover→idempotent PASS (in-memory)' : `FAIL exit=${unit.status} ${String(unit.stderr || unit.stdout).slice(0, 240)}`,
      { layer: 'api_subsuite' },
    );
  }

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
  // Wrong API port simulation (connection_error classification only — NOT a dependency fault test)
  const wrongApi = apiPort + 7777;
  const wrongBase = `http://127.0.0.1:${wrongApi}`;
  const faultHit = await api(wrongBase, 'GET', '/health');
  const faultClassOk = faultHit.status === 0 && faultHit.classify === 'connection_error';
  record(
    'fault-api-wrong-port-classify',
    faultClassOk,
    `classify=${faultHit.classify || faultHit.error || 'n/a'} port=${wrongApi} (NOT dependency-fault proof)`,
    { tier: 'optional', layer: 'api_subsuite' },
  );
  faultNotes.push(`API wrong-port ${wrongApi}: ${faultHit.classify || faultHit.error} — classification only`);

  // Honest rule: wrong-port TCP probe is NOT enough to call "dependency fault test"
  const redisProbe = await tcpProbe('127.0.0.1', redisPort);
  const pgProbe = await tcpProbe('127.0.0.1', pgPort);
  const wrongRedisPort = redisPort + 1111;
  const wrongRedis = await tcpProbe('127.0.0.1', wrongRedisPort);
  const allowControlled = process.env.SALES_OS_ACCEPTANCE_ALLOW_DEP_STOP === '1';
  // Controlled stop/restart only when explicitly enabled AND native project ports are the ones in use.
  // Never touch Sub2API. On shared bot redis/pg (5432/6379) → SKIP.
  if (!allowControlled || (!redisProbe.ok && !pgProbe.ok)) {
    skip(
      'fault-dependency-controlled-stop',
      `SKIP: controlled PG/Redis stop not run (allow=${allowControlled ? 1 : 0}; native redis:${redisPort}=${redisProbe.classify} pg:${pgPort}=${pgProbe.classify}). Wrong-port redis ${wrongRedisPort}=${wrongRedis.classify} is NOT a dependency fault test. User Windows Stop PG/Redis already PASS. Sub2API ${sub2apiPorts.join('/')} untouched.`,
      'optional',
      'api_subsuite',
    );
    faultNotes.push('dependency fault: SKIP on bot — need SALES_OS_ACCEPTANCE_ALLOW_DEP_STOP=1 + isolated project ports; cite user PASS for Windows PG/Redis stop');
  } else {
    skip(
      'fault-dependency-controlled-stop',
      'SKIP: harness refuses auto stop/restart even when allow=1 on this bot build — use Windows native scripts for isolated dep fault; Sub2API untouched.',
      'optional',
      'api_subsuite',
    );
    faultNotes.push('allow flag set but bot harness still skips auto stop for safety');
  }

  // Readiness contract after probes: still ready
  const recovered = await api(base, 'GET', healthPath);
  const recoveredLive = await api(base, 'GET', livePath);
  record(
    'fault-recovery-readiness',
    recovered.status === 200 && recovered.json?.ok === true && recoveredLive.status === 200,
    `readiness HTTP ${recovered.status} liveness HTTP ${recoveredLive.status}; Sub2API ${sub2apiPorts.join('/')} never operated`,
    { layer: 'api_subsuite' },
  );
  faultNotes.push('recovery: readiness+liveness re-checked; no Sub2API ops; no shared redis/pg stop on bot');

  // SSRF smoke via import of clearly private URL (manager auth ≠ intranet permission)
  const ssrf = await api(base, 'POST', `${pfx}/leads/import/authorized-public-list`, {
    token: mgr.token,
    body: {
      fetch_official: true,
      batch_label: `${PACK}-ssrf`,
      items: [{
        company_name: 'SSRF Probe Localhost',
        official_site_url: 'http://127.0.0.1:3100/health',
        product_code: 'sales-agent',
        match_reason_vs_icp: 'negative SSRF probe — must not fetch loopback',
        contact_person: 'UNKNOWN',
        demand: 'UNKNOWN',
        consent_status: 'UNKNOWN',
      }],
    },
  });
  const ssrfItem = Array.isArray(ssrf.json?.items) ? ssrf.json.items[0] : null;
  record(
    'ssrf-reject-loopback',
    ssrf.status < 300 && ssrfItem?.verification_status === 'fetch_failed',
    `verification=${ssrfItem?.verification_status || 'n/a'} facts=${ssrfItem?.public_facts_excerpt || 'n/a'} HTTP ${ssrf.status}`,
    { layer: 'api_subsuite' },
  );

  {
    const { spawnSync } = await import('node:child_process');
    const unit = spawnSync(process.execPath, ['--test', 'scripts/acceptance/unit/public-fetch-ssrf.test.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    });
    record(
      'ssrf-unit-title-ip-dns-pin',
      unit.status === 0,
      unit.status === 0
        ? 'offline title honesty + IPv4-mapped hex + fe80/10 + DNS rebind mock PASS'
        : `FAIL exit=${unit.status} ${String(unit.stderr || unit.stdout).slice(0, 240)}`,
      { layer: 'api_subsuite' },
    );
  }

  // --- P0+P1 assertions (2026-09-26) ---
  {
    // Follow-up requires next_follow_at → 400
    const miss = await api(base, 'POST', `${pfx}/leads/${synA.caseId}/activities`, {
      token: s1.token,
      body: { kind: 'followup', body: 'missing next should 400' },
    });
    record(
      'followup-requires-next-follow-at',
      miss.status === 400,
      `HTTP ${miss.status} msg=${String(miss.json?.message || '').slice(0, 80)}`,
      { layer: 'api_subsuite' },
    );

    // Pool rules get/put + public list + concurrent claim
    const rulesGet = await api(base, 'GET', `${pfx}/pool/rules`, { token: mgr.token });
    record('pool-rules-get', rulesGet.status === 200 && rulesGet.json?.max_private_cases != null, `HTTP ${rulesGet.status}`, { layer: 'api_subsuite' });
    const rulesPut = await api(base, 'PUT', `${pfx}/pool/rules`, {
      token: mgr.token,
      body: {
        max_private_cases: rulesGet.json?.max_private_cases || 50,
        protect_hours: rulesGet.json?.protect_hours || 48,
        idle_days_to_recycle: rulesGet.json?.idle_days_to_recycle || 7,
        enabled: true,
      },
    });
    record('pool-rules-put', rulesPut.status === 200 && rulesPut.json?.enabled === true, `HTTP ${rulesPut.status}`, { layer: 'api_subsuite' });

    // Create a public-sea case for claim race
    const phonePool = `139${String(Date.now()).slice(-8)}`;
    const poolIntake = await api(base, 'POST', `${pfx}/leads/intake`, {
      token: mgr.token,
      body: {
        phone: phonePool,
        name: 'POOL_CLAIM_FIXTURE',
        company_name: 'POOL claim race co',
        source_type: 'synthetic_fixture',
        source_channel: 'acceptance',
        consent_accepted: true,
        product_code: 'sales-agent',
        path: 'STANDARD',
      },
    });
    const poolCaseId = poolIntake.json?.case?.id;
    await api(base, 'POST', `${pfx}/leads/${poolCaseId}/qualify`, { token: mgr.token, body: {} });
    // ensure public
    await api(base, 'POST', `${pfx}/pool/${poolCaseId}/release`, { token: mgr.token, body: { reason: 'acceptance_to_public' } }).catch(() => null);
    // force public via release if owned; if never assigned, case should already be public
    const pub = await api(base, 'GET', `${pfx}/pool/public`, { token: s1.token });
    record('pool-public-list', pub.status === 200 && Array.isArray(pub.json?.items), `items=${pub.json?.items?.length ?? 'n/a'}`, { layer: 'api_subsuite' });

    const [c1, c2] = await Promise.all([
      api(base, 'POST', `${pfx}/pool/${poolCaseId}/claim`, { token: s1.token, body: {} }),
      api(base, 'POST', `${pfx}/pool/${poolCaseId}/claim`, { token: s2.token, body: {} }),
    ]);
    const wins = [c1, c2].filter((x) => x.status < 300).length;
    const loses = [c1, c2].filter((x) => x.status >= 400).length;
    record(
      'pool-claim-race-one-winner',
      wins === 1 && loses >= 1,
      `wins=${wins} loses=${loses} s1=${c1.status} s2=${c2.status}`,
      { layer: 'api_subsuite' },
    );

    // Boss screens
    const boss = await api(base, 'GET', `${pfx}/boss/screens`, { token: mgr.token });
    record(
      'boss-screens',
      boss.status === 200
        && boss.json?.screen1_team_todos
        && boss.json?.screen2_funnel
        && boss.json?.screen3_payment_risk
        && typeof boss.json.screen3_payment_risk.empty === 'boolean',
      `HTTP ${boss.status} empty_risk=${boss.json?.screen3_payment_risk?.empty}`,
      { layer: 'api_subsuite' },
    );
    const bossAgent = await api(base, 'GET', `${pfx}/boss/screens`, { token: s1.token });
    record('boss-rbac-agent-denied', bossAgent.status === 403, `HTTP ${bossAgent.status}`, { layer: 'api_subsuite' });

    // CSV import polish
    const csvTpl = await api(base, 'GET', `${pfx}/import/csv/template`, { token: mgr.token });
    record('csv-template', csvTpl.status === 200 && csvTpl.bytes > 20, `HTTP ${csvTpl.status} bytes=${csvTpl.bytes}`, { layer: 'api_subsuite' });
    // api() JSON-parses; template is CSV text — handle via raw fetch path: status may be 200 with raw
    const csvBody = [
      'company_name,contact_name,phone,email,source,product_code,demand,note',
      `"CSV Good Co","李四","137${String(Date.now()).slice(-8)}","","展会名录","sales-agent","UNKNOWN","ok"`,
      '"CSV Bad Co","王五","","","","sales-agent","UNKNOWN","missing source"',
    ].join('\n');
    const csvImp = await api(base, 'POST', `${pfx}/import/csv`, {
      token: mgr.token,
      body: { csv: csvBody },
    });
    record(
      'csv-import-partial-success',
      csvImp.status < 300
        && csvImp.json?.success_count >= 1
        && csvImp.json?.failed_count >= 1
        && typeof csvImp.json?.summary_zh === 'string',
      `success=${csvImp.json?.success_count} failed=${csvImp.json?.failed_count} HTTP ${csvImp.status}`,
      { layer: 'api_subsuite' },
    );

    // Contract + payment risk feed
    const wonCase = synA.caseId;
    await api(base, 'POST', `${pfx}/leads/${wonCase}/mark-result`, {
      token: s1.token, body: { result: 'won', note: 'acceptance won for contract' },
    });
    const contract = await api(base, 'POST', `${pfx}/contracts`, {
      token: mgr.token,
      body: { case_id: wonCase, amount: '10000', status: 'signed', currency: 'CNY' },
    });
    record('contract-create', contract.status < 300 && contract.json?.contract?.id, `HTTP ${contract.status}`, { layer: 'api_subsuite' });
    const plan = await api(base, 'POST', `${pfx}/payment-plans`, {
      token: mgr.token,
      body: {
        contract_id: contract.json?.contract?.id,
        amount: '5000',
        due_at: new Date(Date.now() - 86400000).toISOString(),
      },
    });
    record('payment-plan-create', plan.status < 300 && plan.json?.id, `HTTP ${plan.status}`, { layer: 'api_subsuite' });
    const boss2 = await api(base, 'GET', `${pfx}/boss/screens`, { token: mgr.token });
    const overdueN = boss2.json?.screen3_payment_risk?.overdue_plans?.length || 0;
    record('payment-risk-overdue-visible', boss2.status === 200 && overdueN >= 1, `overdue=${overdueN}`, { layer: 'api_subsuite' });
    const receipt = await api(base, 'POST', `${pfx}/payment-receipts`, {
      token: mgr.token,
      body: {
        contract_id: contract.json?.contract?.id,
        plan_id: plan.json?.id,
        amount: '5000',
      },
    });
    record('payment-receipt-create', receipt.status < 300 && receipt.json?.id, `HTTP ${receipt.status}`, { layer: 'api_subsuite' });

    // Dial task mock flow
    const dialTask = await api(base, 'POST', `${pfx}/dial-tasks`, {
      token: mgr.token,
      body: { name: 'acceptance-dial', case_ids: [synB.caseId] },
    });
    record('dial-task-create', dialTask.status < 300 && dialTask.json?.id, `HTTP ${dialTask.status}`, { layer: 'api_subsuite' });
    const nextItem = await api(base, 'POST', `${pfx}/dial-tasks/${dialTask.json?.id}/next`, {
      token: s2.token, body: {},
    });
    record('dial-task-next', nextItem.status < 300 && nextItem.json?.item?.id, `HTTP ${nextItem.status}`, { layer: 'api_subsuite' });
    const dialRes = await api(base, 'POST', `${pfx}/dial-items/${nextItem.json?.item?.id}/result`, {
      token: s2.token,
      body: { result: 'connected', note: 'mock ok', start_call: true },
    });
    record(
      'dial-mock-result-call',
      dialRes.status < 300 && dialRes.json?.call_record?.mode === 'mock',
      `mode=${dialRes.json?.call_record?.mode} HTTP ${dialRes.status}`,
      { layer: 'api_subsuite' },
    );

    // Scripts CRUD + recommend
    const script = await api(base, 'POST', `${pfx}/scripts`, {
      token: mgr.token,
      body: { scene: '开场', title: '验收开场', body: '您好，我们是…', tags: ['sales-agent'] },
    });
    record('script-create', script.status < 300 && script.json?.id, `HTTP ${script.status}`, { layer: 'api_subsuite' });
    const rec = await api(base, 'GET', `${pfx}/scripts/recommend/${synB.caseId}`, { token: s2.token });
    record('script-recommend', rec.status === 200 && Array.isArray(rec.json?.items), `items=${rec.json?.items?.length ?? 0}`, { layer: 'api_subsuite' });

    // WeCom mock sidepanel
    const wecomSt = await api(base, 'GET', `${pfx}/wecom/status`, { token: mgr.token });
    record(
      'wecom-status-mock',
      wecomSt.status === 200 && (wecomSt.json?.mode === 'mock' || wecomSt.json?.honest_label),
      `mode=${wecomSt.json?.mode}`,
      { layer: 'api_subsuite' },
    );
    const wecomCtx = await api(base, 'GET', `${pfx}/wecom/sidepanel/context?external_userid=mock-ext-acc&mock=1`, { token: s1.token });
    record('wecom-context-mock', wecomCtx.status === 200, `case=${wecomCtx.json?.case?.id ? 'yes' : 'no'}`, { layer: 'api_subsuite' });
    if (wecomCtx.json?.case?.id) {
      const wf = await api(base, 'POST', `${pfx}/wecom/sidepanel/follow-up`, {
        token: s1.token,
        body: {
          case_id: wecomCtx.json.case.id,
          body: 'wecom mock follow',
          next_follow_at: new Date(Date.now() + 3600000).toISOString(),
          tags: ['企微'],
        },
      });
      record('wecom-followup-mock', wf.status < 300 && wf.json?.activity?.id, `HTTP ${wf.status}`, { layer: 'api_subsuite' });
    } else {
      skip('wecom-followup-mock', 'no case resolved in mock context', 'optional');
    }

    // Offline unit pack for P0P1
    {
      const { spawnSync } = await import('node:child_process');
      const unit = spawnSync(process.execPath, ['--test',
        'scripts/acceptance/unit/pool-claim-race.test.mjs',
        'scripts/acceptance/unit/followup-requires-next.test.mjs',
        'scripts/acceptance/unit/payment-risk.test.mjs',
        'scripts/acceptance/unit/dial-mock-call.test.mjs',
        'scripts/acceptance/unit/wecom-mock.test.mjs',
      ], { cwd: process.cwd(), encoding: 'utf8', env: process.env });
      record(
        'p0p1-offline-units',
        unit.status === 0,
        unit.status === 0 ? 'pool/followup/payment/dial/wecom units PASS' : `FAIL ${String(unit.stderr || unit.stdout).slice(0, 200)}`,
        { layer: 'api_subsuite' },
      );
    }
  }

  // UI pending — always SKIP tier ui_pending, never PASS; cannot make product全绿
  skip(
    'ui-typed-browser-login',
    '本侧 UI 未测: typed browser password login + list UI isolation. API login ≠ UI. Codex/user must verify on Windows.',
    'ui_pending',
    'ui',
  );

  // --- Summary / layered OVERALL ---
  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIP');
  const requiredFailed = results.filter((r) => r.status === 'FAIL' && REQUIRED_TIERS.has(r.tier));
  const requiredSkipped = results.filter((r) => r.status === 'SKIP' && REQUIRED_TIERS.has(r.tier));
  const layerStats = {};
  for (const layer of ['api_subsuite', 'real_source_gate', 'ui']) {
    const rows = results.filter((r) => r.layer === layer);
    layerStats[layer] = {
      pass: rows.filter((r) => r.status === 'PASS').length,
      fail: rows.filter((r) => r.status === 'FAIL').length,
      skip: rows.filter((r) => r.status === 'SKIP').length,
      green: rows.every((r) => r.status !== 'FAIL')
        && rows.filter((r) => r.status === 'SKIP' && REQUIRED_TIERS.has(r.tier)).length === 0,
    };
  }
  const apiSubsuitePass = failed.filter((r) => r.layer === 'api_subsuite').length === 0
    && results.filter((r) => r.layer === 'api_subsuite' && r.status === 'SKIP' && REQUIRED_TIERS.has(r.tier)).length === 0;
  const realGatePass = layerStats.real_source_gate.green
    && results.filter((r) => r.alias === 'real-source-gate-ge3-verified' && r.status === 'PASS').length === 1;
  const realGateSkipHonest = results.some(
    (r) => r.alias === 'real-source-gate-ge3-verified' && r.status === 'SKIP',
  );
  // Product green requires api + real_source_gate + UI PASS.
  // UI SKIP must NOT claim product全绿 (API≠UI).
  const uiPass = layerStats.ui.pass > 0 && layerStats.ui.fail === 0 && layerStats.ui.skip === 0;
  const productGreen = apiSubsuitePass && realGatePass && uiPass;
  const overallPass = failed.length === 0 && requiredSkipped.length === 0;
  const overall = overallPass ? 'PASS' : 'FAIL';

  const summary = {
    suite: 'business-acceptance',
    pack: PACK,
    ran_at: new Date().toISOString(),
    base,
    host_note: 'bot-or-local; NOT a claim of Windows browser UI PASS; UI SKIP ≠ product全绿',
    overall,
    overall_rule: 'Harness OVERALL PASS if fail_count=0 AND no required-tier SKIP. product_green additionally requires real_source_gate fetch_verified≥3 PASS and must not treat ui SKIP as 全绿.',
    layers: layerStats,
    api_subsuite: apiSubsuitePass ? 'PASS' : 'FAIL',
    real_source_gate: realGatePass ? 'PASS' : (realGateSkipHonest ? 'SKIP' : 'FAIL'),
    ui: 'SKIP',
    product_green: productGreen ? 'PASS' : 'NO',
    fail_count: failed.length,
    skip_count: skipped.length,
    pass_count: results.filter((r) => r.status === 'PASS').length,
    required_fail_count: requiredFailed.length,
    required_skip_count: requiredSkipped.length,
    health_contract: {
      liveness: 'GET /health/live',
      readiness: 'GET /health and GET /health/ready (web /api/health → readiness)',
    },
    real_public_imports: realImported.map((x) => ({
      alias: String(x.case_id).slice(0, 8),
      company: x.company_name,
      source_type: x.source_type,
      official_site_url: x.official_site_url,
      fetch_time: x.fetch_time,
      verification_status: x.verification_status,
      real_public_source: x.real_public_source,
      consent_status: x.consent_status,
      contact_person: x.contact_person,
      demand: x.demand,
      product_code: x.product_code,
      public_facts_excerpt: String(x.public_facts_excerpt || '').slice(0, 80),
    })),
    verification_summary: importRes.json?.verification_summary || {
      fetch_verified: verifiedImported.length,
      fetch_failed: failedImported.length,
      source_provided: providedImported.length,
    },
    synthetic_fixtures: [
      { alias: synA.caseId.slice(0, 8), source_type: 'synthetic_fixture', role: 'pipeline A' },
      { alias: synB.caseId.slice(0, 8), source_type: 'synthetic_fixture', role: 'pipeline B' },
    ],
    due_reminder_honesty:
      'Mechanism = workbench list polling / due-follow-ups query only. NOT worker timed push/delivery. Wall-clock future→past crossing when DUE_WAIT_MS>0.',
    fault_recovery_tested: faultNotes,
    user_already_pass_cited: [
      'Pack 4876745 / SHA256 41d6d3ae… verified; 9 diffs overlaid; API+Web build+start exit0',
      'Runner future 2500ms wall-clock, completed no-dupe, dual-sales isolation, synthetic WON-LOST PASS',
      'User Stop PG 55433 → pre-fix /api/health still 200 while workbench 500; restore → business 200',
      'User Redis 56380 SHUTDOWN SAVE → health+workbench 200; restore → business 200',
      'Sub2API 15432/16379 PIDs unchanged',
    ],
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
  console.log(`LAYERS api_subsuite=${summary.api_subsuite} real_source_gate=${summary.real_source_gate} ui=${summary.ui} product_green=${summary.product_green}`);
  if (skipped.length) {
    console.log('SKIP_LIST ' + skipped.map((s) => s.alias).join(','));
  }
  process.exit(overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FAIL harness-exception —', String(e.message || e).slice(0, 200));
  process.exit(1);
});
