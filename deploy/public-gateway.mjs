#!/usr/bin/env node
/**
 * Isolated public gateway for sales-os demo.
 * Listens 127.0.0.1:18180 only — does not touch other project ports.
 *
 * /api/*  → http://127.0.0.1:3100  (strip /api prefix, same as Vite proxy)
 * /*      → http://127.0.0.1:5174  (Vite web)
 */
import http from 'node:http';
import { URL } from 'node:url';

const LISTEN_HOST = process.env.GATEWAY_HOST || '127.0.0.1';
const LISTEN_PORT = Number(process.env.GATEWAY_PORT || 18180);
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3100';
const WEB_TARGET = process.env.WEB_TARGET || 'http://127.0.0.1:5174';

function pickTarget(reqUrl) {
  if (reqUrl.startsWith('/api/') || reqUrl === '/api') {
    const stripped = reqUrl === '/api' ? '/' : reqUrl.slice('/api'.length);
    return { base: API_TARGET, path: stripped || '/' };
  }
  return { base: WEB_TARGET, path: reqUrl };
}

function forward(req, res) {
  const { base, path } = pickTarget(req.url || '/');
  const target = new URL(path, base);
  const headers = { ...req.headers, host: target.host };
  // Prefer forwarding client IP if present behind tunnel
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

const server = http.createServer((req, res) => {
  if (req.url === '/__gateway_health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'sales-os-public-gateway', api: API_TARGET, web: WEB_TARGET }));
    return;
  }
  forward(req, res);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`sales-os public gateway listening on http://${LISTEN_HOST}:${LISTEN_PORT}`);
  console.log(`  /api/* → ${API_TARGET} (strip /api)`);
  console.log(`  /*     → ${WEB_TARGET}`);
});
