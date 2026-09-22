import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.PUBLIC_URL || fs.readFileSync(path.join(ROOT, 'docs/acceptance/toc-stable/PUBLIC_URL.txt'), 'utf8').trim();
const OUT = path.join(ROOT, 'docs/acceptance/toc-stable/browser');
const QS = 'utm_source=browser_e2e&utm_medium=shot&utm_campaign=toc&invite=INVSHOT1';
fs.mkdirSync(OUT, { recursive: true });

async function shotProduct(page, code, phone) {
  const url = `${BASE}/p/${code}?${QS}`;
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('[data-testid="consent"]', { timeout: 20000 });
  await page.waitForFunction(() => (document.querySelector('h1')?.textContent || '').length > 1, { timeout: 15000 });

  await page.screenshot({ path: path.join(OUT, `${code}-01-consent-unchecked.png`), fullPage: true });

  await page.type('input[placeholder="怎么称呼您"]', '截图测试用户');
  await page.type('input[placeholder="11 位手机号"]', phone);
  await page.screenshot({ path: path.join(OUT, `${code}-02-utm-invite-visible.png`), fullPage: true });

  await page.click('[data-testid="consent"]');
  await page.screenshot({ path: path.join(OUT, `${code}-03-consent-checked.png`), fullPage: true });

  await Promise.all([
    page.waitForSelector('[data-testid="done"]', { timeout: 20000 }),
    page.click('[data-testid="submit"]'),
  ]);
  await page.screenshot({ path: path.join(OUT, `${code}-04-submitted.png`), fullPage: true });

  const caseIdPrefix = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="done"]')?.innerText || '';
    const m = t.match(/案件号\s*([0-9a-f]{8})/i);
    return m ? m[1] : null;
  });
  return { url, caseIdPrefix };
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });

const results = {};
results['ticket-grab'] = await shotProduct(page, 'ticket-grab', '13800138001');
results['usgate'] = await shotProduct(page, 'usgate', '13800138002');

await browser.close();
fs.writeFileSync(path.join(OUT, 'shot-meta.json'), JSON.stringify({ base: BASE, qs: QS, results, at: new Date().toISOString() }, null, 2));
console.log(JSON.stringify(results, null, 2));
