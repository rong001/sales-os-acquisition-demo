/**
 * Cross-time live-poll browser evidence for workbench due follow-ups.
 * Env: GATEWAY_BASE, CASE_ID, NEXT_FOLLOW_AT, SALES1_TOKEN, SALES1_USER_JSON,
 *      SALES2_TOKEN, SALES2_USER_JSON, OUT_DIR, POLL_MS, CHROME_PATH
 * Does NOT mutate next_follow_at. Stays on / without manual reload.
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.GATEWAY_BASE || 'http://127.0.0.1:18180').replace(/\/$/, '');
const CASE_ID = process.env.CASE_ID;
const NEXT_FOLLOW_AT = process.env.NEXT_FOLLOW_AT;
const OUT_DIR = process.env.OUT_DIR || 'docs/acceptance/internal-trial/followup-live-poll';
const POLL_MS = Number(process.env.POLL_MS || 5000);
const S1_TOKEN = process.env.SALES1_TOKEN || '';
const S1_USER = process.env.SALES1_USER_JSON || '';
const S2_TOKEN = process.env.SALES2_TOKEN || '';
const S2_USER = process.env.SALES2_USER_JSON || '';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';

if (!CASE_ID || !NEXT_FOLLOW_AT || !S1_TOKEN || !S2_TOKEN || !S1_USER || !S2_USER) {
  console.error('missing CASE_ID / NEXT_FOLLOW_AT / SALES*_TOKEN / SALES*_USER_JSON');
  process.exit(1);
}

const browserDir = path.join(OUT_DIR, 'browser');
fs.mkdirSync(browserDir, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, '.raw'), { recursive: true });

const shortId = CASE_ID.slice(0, 8);
const meta = {
  browser: CHROME,
  poll_ms: POLL_MS,
  case_id: CASE_ID,
  next_follow_at: NEXT_FOLLOW_AT,
  gateway: BASE,
  auth_mode: 'localStorage_inject',
};

function isoNow() {
  return new Date().toISOString();
}

async function openWorkbench(page, token, userJson) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(
    (t, u) => {
      localStorage.setItem('salesos_token', t);
      localStorage.setItem('salesos_user', u);
    },
    token,
    userJson,
  );
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-testid="due-follow-ups"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="workbench-last-updated"]', { timeout: 15000 });
}

function itemVisible(page) {
  return page.evaluate((sid) => {
    const items = [...document.querySelectorAll('[data-testid="due-follow-item"]')];
    return items.some((el) => (el.textContent || '').includes(sid));
  }, shortId);
}

async function dumpDomHint(page, label) {
  const html = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="due-follow-ups"]');
    const upd = document.querySelector('[data-testid="workbench-last-updated"]');
    const err = document.querySelector('[data-testid="workbench-load-error"]');
    return {
      due: box ? box.innerText : '(no due box)',
      updated: upd ? upd.innerText : null,
      error: err ? err.innerText : null,
      url: location.href,
    };
  });
  fs.writeFileSync(path.join(OUT_DIR, '.raw', `dom-${label}.json`), JSON.stringify(html, null, 2));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
});

try {
  const sales1 = await browser.newPage();
  await sales1.setViewport({ width: 1100, height: 900 });
  sales1.on('pageerror', (e) => {
    fs.appendFileSync(path.join(OUT_DIR, '.raw', 'page-errors.txt'), String(e) + '\n');
  });

  const msLeft = new Date(NEXT_FOLLOW_AT).getTime() - Date.now();
  if (msLeft < 8000) {
    throw new Error(`too little time before due (${msLeft}ms); increase FOLLOWUP_DELAY_SEC`);
  }

  await openWorkbench(sales1, S1_TOKEN, S1_USER);
  meta.sales1_landed_at = isoNow();

  meta.before_shot_at = isoNow();
  const beforeVisible = await itemVisible(sales1);
  await dumpDomHint(sales1, 'before');
  await sales1.screenshot({
    path: path.join(browserDir, 'sales1-workbench-before-due.png'),
    fullPage: true,
  });
  meta.before_item_visible = beforeVisible;
  if (beforeVisible) {
    throw new Error('case already visible in due list BEFORE next_follow_at');
  }

  const target = new Date(NEXT_FOLLOW_AT).getTime() + POLL_MS + 1500;
  while (Date.now() < target) {
    await new Promise((r) => setTimeout(r, 400));
  }

  const appearDeadline = Date.now() + POLL_MS * 8 + 8000;
  let afterVisible = false;
  while (Date.now() < appearDeadline) {
    afterVisible = await itemVisible(sales1);
    if (afterVisible) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  meta.after_shot_at = isoNow();
  meta.after_item_visible = afterVisible;
  await dumpDomHint(sales1, 'after');
  await sales1.screenshot({
    path: path.join(browserDir, 'sales1-workbench-after-due.png'),
    fullPage: true,
  });
  if (!afterVisible) {
    throw new Error('due item did not appear after next_follow_at without reload');
  }

  const sales2 = await browser.newPage();
  await sales2.setViewport({ width: 1100, height: 900 });
  await openWorkbench(sales2, S2_TOKEN, S2_USER);
  meta.sales2_check_at = isoNow();
  const s2Visible = await itemVisible(sales2);
  meta.sales2_item_visible = s2Visible;
  await dumpDomHint(sales2, 'sales2');
  await sales2.screenshot({
    path: path.join(browserDir, 'sales2-workbench-same-period.png'),
    fullPage: true,
  });
  if (s2Visible) {
    throw new Error('sales2 incorrectly sees sales1 due item');
  }
  await sales2.close();

  const clicked = await sales1.evaluate((sid) => {
    const items = [...document.querySelectorAll('[data-testid="due-follow-item"]')];
    const hit = items.find((el) => (el.textContent || '').includes(sid));
    if (!hit) return false;
    const btn = hit.querySelector('[data-testid="due-follow-handle"]');
    if (!btn) return false;
    btn.click();
    return true;
  }, shortId);
  if (!clicked) throw new Error('failed to click 已处理');
  meta.handled_click_at = isoNow();

  const goneDeadline = Date.now() + POLL_MS * 4 + 5000;
  let gone = false;
  while (Date.now() < goneDeadline) {
    const still = await itemVisible(sales1);
    if (!still) {
      gone = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, POLL_MS + 1000));
  const stillAfterPoll = await itemVisible(sales1);
  meta.handled_verify_at = isoNow();
  meta.handled_gone = gone && !stillAfterPoll;
  await dumpDomHint(sales1, 'handled');
  await sales1.screenshot({
    path: path.join(browserDir, 'sales1-workbench-after-handled.png'),
    fullPage: true,
  });
  if (!meta.handled_gone) {
    throw new Error('item still visible after 已处理 across poll cycles');
  }

  fs.writeFileSync(path.join(browserDir, 'browser-meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, meta }, null, 2));
} catch (e) {
  try {
    const pages = await browser.pages();
    for (let i = 0; i < pages.length; i++) {
      await pages[i]
        .screenshot({ path: path.join(browserDir, `failure-page-${i}.png`), fullPage: true })
        .catch(() => {});
    }
  } catch { /* ignore */ }
  fs.writeFileSync(
    path.join(browserDir, 'browser-meta.json'),
    JSON.stringify({ ...meta, error: String(e) }, null, 2) + '\n',
  );
  throw e;
} finally {
  await browser.close();
}
