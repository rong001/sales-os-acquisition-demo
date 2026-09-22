#!/usr/bin/env node
/**
 * Isolated public gateway for sales-os demo.
 * Listens 127.0.0.1:18180 only — does not touch other project ports.
 *
 * /api/*           → API_TARGET (strip /api prefix, same as Vite proxy)
 * /__gateway_health → gateway self
 * /__ready          → gateway + upstream API health
 * /*                → static WEB_STATIC_DIR (SPA fallback) OR proxy WEB_TARGET
 *
 * Modes:
 *   GATEWAY_WEB_MODE=static (default when dist exists) — serve apps/web/dist
 *   GATEWAY_WEB_MODE=proxy  — reverse-proxy to WEB_TARGET (Vite dev)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LISTEN_HOST = process.env.GATEWAY_HOST || '127.0.0.1';
const LISTEN_PORT = Number(process.env.GATEWAY_PORT || 18180);
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3100';
const WEB_TARGET = process.env.WEB_TARGET || 'http://127.0.0.1:5174';
const DEFAULT_STATIC = path.join(ROOT, 'apps/web/dist');
const WEB_STATIC_DIR = process.env.WEB_STATIC_DIR
  ? path.resolve(process.env.WEB_STATIC_DIR)
  : DEFAULT_STATIC;

function detectMode() {
  const forced = (process.env.GATEWAY_WEB_MODE || '').toLowerCase();
  if (forced === 'proxy' || forced === 'static') return forced;
  if (fs.existsSync(path.join(WEB_STATIC_DIR, 'index.html'))) return 'static';
  return 'proxy';
}

const WEB_MODE = detectMode();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'content-type': type,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(body);
}

function serveStatic(req, res) {
  const urlPath = (req.url || '/').split('?')[0] || '/';
  let filePath = safeJoin(WEB_STATIC_DIR, urlPath === '/' ? '/index.html' : urlPath);
  if (!filePath) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }
  // SPA fallback
  const indexHtml = path.join(WEB_STATIC_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    sendFile(res, indexHtml);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found — run npm run build');
}

function pickTarget(reqUrl) {
  if (reqUrl.startsWith('/api/') || reqUrl === '/api') {
    const stripped = reqUrl === '/api' ? '/' : reqUrl.slice('/api'.length);
    return { base: API_TARGET, path: stripped || '/' };
  }
  return { base: WEB_TARGET, path: reqUrl };
}

function forward(req, res) {
  const { base, path: p } = pickTarget(req.url || '/');
  const target = new URL(p, base);
  const headers = { ...req.headers, host: target.host };
  if (!headers['x-forwarded-for'] && req.socket?.remoteAddress) {
    headers['x-forwarded-for'] = req.socket.remoteAddress;
  }
  headers['x-forwarded-proto'] = headers['x-forwarded-proto'] || 'https';

  const opts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('[gateway] upstream error', opts.method, opts.path, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'bad_gateway', message: err.message }));
  });
  req.pipe(proxyReq);
}

function checkApiHealth() {
  return new Promise((resolve) => {
    const target = new URL('/health', API_TARGET);
    const req = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 80,
        path: target.pathname,
        method: 'GET',
        timeout: 2000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          resolve({ ok: res.statusCode === 200, status: res.statusCode, body: buf.slice(0, 200) });
        });
      },
    );
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  if (url === '/__gateway_health' || url.startsWith('/__gateway_health?')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'sales-os-public-gateway',
      api: API_TARGET,
      web_mode: WEB_MODE,
      web: WEB_MODE === 'static' ? WEB_STATIC_DIR : WEB_TARGET,
    }));
    return;
  }
  if (url === '/__ready' || url.startsWith('/__ready?')) {
    const api = await checkApiHealth();
    const ready = !!api.ok;
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: ready,
      service: 'sales-os-public-gateway',
      web_mode: WEB_MODE,
      api,
    }));
    return;
  }
  if (url.startsWith('/api/') || url === '/api' || url.startsWith('/api?')) {
    forward(req, res);
    return;
  }
  if (WEB_MODE === 'static') {
    serveStatic(req, res);
    return;
  }
  forward(req, res);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`sales-os public gateway listening on http://${LISTEN_HOST}:${LISTEN_PORT}`);
  console.log(`  /api/* → ${API_TARGET} (strip /api)`);
  if (WEB_MODE === 'static') {
    console.log(`  /*     → static ${WEB_STATIC_DIR} (SPA)`);
  } else {
    console.log(`  /*     → proxy ${WEB_TARGET}`);
  }
});
