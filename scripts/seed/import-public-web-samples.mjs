#!/usr/bin/env node
/**
 * Import 3–5 read-only public B2B company profiles from official public websites.
 * Stores: company name, official site URL, fetch time, match reason vs ICP.
 * source_type / LeadSource.type = public_web_sample
 * Does NOT invent intent/budget. No individual PII scraping.
 *
 * Env: API_BASE (e.g. http://127.0.0.1:39300), LOGIN_EMAIL, LOGIN_PASSWORD
 * Optional: TENANT via login. Uses public intake when possible; falls back to
 * authenticated import path if available.
 */
import fs from 'node:fs';
import path from 'node:path';

const API = (process.env.API_BASE || 'http://127.0.0.1:39300').replace(/\/$/, '');
const OUT = process.env.OUT_JSON || 'docs/acceptance/internal-trial/SALES-MASTER-20260923/public-web-samples.json';

/** ICP: B2B SaaS / developer platform / cloud vendors that might buy sales tooling demos */
const SAMPLES = [
  {
    company_name: 'Stripe, Inc.',
    official_site_url: 'https://stripe.com/',
    match_reason_vs_icp: 'Global B2B payments platform; public company site; fits cloud/SaaS buyer ICP for sales-ops tooling demos.',
    product_code: 'usgate',
  },
  {
    company_name: 'HashiCorp',
    official_site_url: 'https://www.hashicorp.com/',
    match_reason_vs_icp: 'Infrastructure automation vendor (public site); B2B developer-tooling ICP adjacency.',
    product_code: 'usgate',
  },
  {
    company_name: 'GitLab Inc.',
    official_site_url: 'https://about.gitlab.com/',
    match_reason_vs_icp: 'DevSecOps platform company; public about site; B2B software ICP.',
    product_code: 'ticket-grab',
  },
  {
    company_name: 'Cloudflare, Inc.',
    official_site_url: 'https://www.cloudflare.com/',
    match_reason_vs_icp: 'Edge/security network vendor; public corporate site; B2B infrastructure ICP.',
    product_code: 'usgate',
  },
  {
    company_name: 'Notion Labs, Inc.',
    official_site_url: 'https://www.notion.com/',
    match_reason_vs_icp: 'B2B productivity SaaS; public marketing site; collaboration-software ICP.',
    product_code: 'ticket-grab',
  },
];

async function fetchOfficial(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'user-agent': 'sales-os-public-sample-bot/1.0 (+read-only; company pages only)' },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      final_url: res.url,
      bytes: text.length,
      title: (text.match(/<title[^>]*>([^<]*)<\/title>/i) || [,''])[1].trim().slice(0, 200) || null,
    };
  } finally {
    clearTimeout(t);
  }
}

async function login() {
  const email = process.env.LOGIN_EMAIL || 'manager@demo.local';
  const password = process.env.LOGIN_PASSWORD;
  if (!password) throw new Error('LOGIN_PASSWORD required');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login failed HTTP ${res.status}`);
  return body.access_token;
}

async function publicIntake(sample, fetched_at, fetch_meta) {
  // Company-level only: synthetic contact email on demo.local — NOT a real person scrape
  const slug = sample.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const payload = {
    name: sample.company_name,
    email: `public-sample+${slug}@demo.local`,
    company_name: sample.company_name,
    product_code: sample.product_code,
    source_type: 'public_web_sample',
    source_channel: 'public_web_sample',
    landing_url: sample.official_site_url,
    consent_accepted: true,
    utm_source: 'public_web_sample',
    utm_medium: 'manual_import',
    utm_campaign: 'SALES-MASTER-20260923',
    raw: {
      source_type: 'public_web_sample',
      official_site_url: sample.official_site_url,
      fetch_time: fetched_at,
      fetch_http_status: fetch_meta.status,
      fetch_title: fetch_meta.title || null,
      fetch_final_url: fetch_meta.final_url || null,
      match_reason_vs_icp: sample.match_reason_vs_icp,
      intent: 'unknown',
      budget: 'unknown',
      label: 'public_web_sample_not_synthetic_regression',
    },
  };
  const res = await fetch(`${API}/public/leads/intake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { http: res.status, body };
}

const fetched_at = new Date().toISOString();
const report = {
  imported_at: fetched_at,
  api: API,
  source_type: 'public_web_sample',
  note: 'Company-level public profiles only; no individual PII scrape; intent/budget not invented.',
  samples: [],
};

for (const sample of SAMPLES) {
  const meta = await fetchOfficial(sample.official_site_url);
  const row = {
    company_name: sample.company_name,
    official_site_url: sample.official_site_url,
    fetch_time: fetched_at,
    match_reason_vs_icp: sample.match_reason_vs_icp,
    source_type: 'public_web_sample',
    fetch: meta,
    intake: null,
  };
  if (!meta.ok) {
    row.intake = { skipped: true, reason: `official site fetch HTTP ${meta.status}` };
  } else {
    row.intake = await publicIntake(sample, fetched_at, meta);
  }
  report.samples.push(row);
  console.log(`${meta.ok ? 'FETCH_OK' : 'FETCH_FAIL'} ${sample.company_name} → intake HTTP ${row.intake?.http || 'skipped'}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('wrote', OUT);
const okCount = report.samples.filter((s) => s.intake && s.intake.http && s.intake.http < 300).length;
if (okCount < 3) {
  console.error(`FAIL: only ${okCount} samples imported (need >=3)`);
  process.exit(1);
}
console.log(`OK: ${okCount} public_web_sample intakes`);
