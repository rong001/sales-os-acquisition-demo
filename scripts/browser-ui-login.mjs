#!/usr/bin/env node
/**
 * Real Chromium UI login — types credentials into /login.
 * NO localStorage injection. Env: BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD, OUT_DIR
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:19280';
const EMAIL = process.env.LOGIN_EMAIL || 'manager@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD;
const OUT = process.env.OUT_DIR || 'docs/acceptance/internal-trial/SALES-MASTER-20260923/browser';

if (!PASSWORD || PASSWORD === 'CHANGE_ME') {
  console.error('FAIL: LOGIN_PASSWORD required (not printed)');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const result = {
  base: BASE,
  email: EMAIL,
  localStorage_inject: false,
  typed_credentials: true,
  overall: 'FAIL',
  steps: [],
};

function step(name, ok, detail) {
  result.steps.push({ name, ok, detail: detail || null });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, '01-login-page.png'), fullPage: true });
  step('open_/login', true);

  // Clear any prefilled email then type
  const emailSel = 'input[autocomplete="username"], input.input';
  const passSel = 'input[type="password"]';
  await page.locator(emailSel).first().fill('');
  await page.locator(emailSel).first().type(EMAIL, { delay: 20 });
  await page.locator(passSel).first().fill('');
  await page.locator(passSel).first().type(PASSWORD, { delay: 20 });
  await page.screenshot({ path: path.join(OUT, '02-credentials-typed.png'), fullPage: true });
  step('type_credentials', true, 'no localStorage inject');

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
    page.locator('button.btn-primary, button:has-text("登录")').first().click(),
  ]);

  // Wait for navigation away from login or token in storage SET BY APP after response
  await page.waitForTimeout(1500);
  const url = page.url();
  const token = await page.evaluate(() => localStorage.getItem('salesos_token'));
  const userRaw = await page.evaluate(() => localStorage.getItem('salesos_user'));
  let role = null;
  try { role = userRaw ? JSON.parse(userRaw).role : null; } catch { /* ignore */ }

  await page.screenshot({ path: path.join(OUT, '03-after-submit.png'), fullPage: true });

  const leftLogin = !url.includes('/login');
  const hasToken = Boolean(token && token.length > 20);
  step('session_established', leftLogin && hasToken, `url=${url} role=${role || '?'}`);

  if (leftLogin && hasToken) {
    // Hit an authenticated page
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.screenshot({ path: path.join(OUT, '04-workbench.png'), fullPage: true });
    step('workbench_loads', true);
    result.overall = 'PASS';
    result.role = role;
  } else {
    const errText = await page.locator('.tag.warn, .error').first().textContent().catch(() => '');
    step('workbench_loads', false, errText || 'still on login or no token');
  }
} catch (e) {
  step('exception', false, String(e && e.message ? e.message : e));
  try { await page.screenshot({ path: path.join(OUT, '99-error.png'), fullPage: true }); } catch { /* ignore */ }
} finally {
  await browser.close();
  const outJson = path.join(OUT, 'ui-login.json');
  fs.writeFileSync(outJson, JSON.stringify(result, null, 2));
  console.log(`wrote ${outJson}`);
  process.exit(result.overall === 'PASS' ? 0 : 1);
}
