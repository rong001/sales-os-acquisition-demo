/**
 * Public-only HTTP(S) fetch for authorized enterprise source verification.
 * Rejects non-public targets (RFC1918, loopback, link-local, metadata, localhost names).
 * Validates every redirect hop (DNS resolve + IP check). Limits body size + timeouts.
 * Manager auth does NOT grant intranet/metadata access.
 */
import * as dns from 'dns/promises';
import * as net from 'net';

export type PublicFetchStatus =
  | 'fetch_verified'
  | 'fetch_failed'
  | 'pending_verification'
  | 'source_provided';

export type PublicFetchResult = {
  verification_status: Exclude<PublicFetchStatus, 'source_provided' | 'pending_verification'> | 'fetch_failed' | 'fetch_verified';
  http_status: number | null;
  final_url: string;
  title: string | null;
  description: string | null;
  facts_excerpt: string | null;
  bytes: number;
  error: string | null;
  redirect_hops: number;
  blocked_reason: string | null;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
]);

const ERROR_TITLE_RE =
  /just a moment|attention required|access denied|forbidden|too many requests|rate limit|error\s*\d{3}|service unavailable|captcha|cloudflare|akamai|blocked|unauthorized|not found|404|429|503|502|500/i;

function isIpv4Private(ip: string): boolean {
  const parts = ip.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // this network
  if (a === 169 && b === 254) return true; // link-local / AWS metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isIpv6Private(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length);
    if (net.isIP(v4) === 4) return isIpv4Private(v4);
  }
  return false;
}

export function isNonPublicIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isIpv4Private(ip);
  if (kind === 6) return isIpv6Private(ip);
  return true;
}

function hostnameBlocked(hostname: string): string | null {
  const h = hostname.replace(/\.$/, '').toLowerCase();
  if (!h) return 'empty_hostname';
  if (BLOCKED_HOSTNAMES.has(h)) return `blocked_hostname:${h}`;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return `blocked_hostname_suffix:${h}`;
  }
  if (h === 'metadata' || h.startsWith('metadata.')) return `blocked_metadata_host:${h}`;
  // Literal IP in hostname
  if (net.isIP(h)) {
    if (isNonPublicIp(h)) return `blocked_literal_ip:${h}`;
  }
  return null;
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  const blocked = hostnameBlocked(hostname);
  if (blocked) throw new Error(blocked);
  if (net.isIP(hostname)) {
    if (isNonPublicIp(hostname)) throw new Error(`blocked_literal_ip:${hostname}`);
    return;
  }
  let records: { address: string; family: number }[] = [];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(`dns_resolve_failed:${(e as Error).message || e}`);
  }
  if (!records.length) throw new Error('dns_empty');
  for (const r of records) {
    if (isNonPublicIp(r.address)) {
      throw new Error(`blocked_resolved_ip:${r.address}`);
    }
  }
}

function parseUrlOrThrow(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('invalid_url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`blocked_protocol:${u.protocol}`);
  }
  if (u.username || u.password) throw new Error('blocked_userinfo');
  return u;
}

function extractTitleDesc(html: string): { title: string | null; description: string | null } {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ''])[1].trim().slice(0, 160) || null;
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim().slice(0, 280) : null;
  return { title, description };
}

function looksLikeErrorPage(httpStatus: number, title: string | null, bodySample: string): boolean {
  if (httpStatus === 429 || httpStatus === 403 || httpStatus === 401 || httpStatus >= 500) return true;
  if (httpStatus >= 400) return true;
  if (title && ERROR_TITLE_RE.test(title)) return true;
  // Cloudflare / challenge markers without usable facts
  if (/cf-browser-verification|challenge-platform|cdn-cgi\/challenge/i.test(bodySample)) return true;
  return false;
}

async function readBodyLimited(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body || typeof (res.body as ReadableStream).getReader !== 'function') {
    const text = await res.text();
    if (text.length > maxBytes) {
      return { text: text.slice(0, maxBytes), bytes: maxBytes, truncated: true };
    }
    return { text, bytes: text.length, truncated: false };
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.length > maxBytes) {
      const remain = maxBytes - total;
      if (remain > 0) chunks.push(value.slice(0, remain));
      total = maxBytes;
      truncated = true;
      try { await reader.cancel(); } catch { /* */ }
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buf.toString('utf8'), bytes: total, truncated };
}

export async function fetchPublicSource(
  officialUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number },
): Promise<PublicFetchResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  const fail = (partial: Partial<PublicFetchResult> & { error: string }): PublicFetchResult => ({
    verification_status: 'fetch_failed',
    http_status: partial.http_status ?? null,
    final_url: partial.final_url ?? officialUrl,
    title: null,
    description: null,
    facts_excerpt: null, // never store error-page HTML as facts
    bytes: partial.bytes ?? 0,
    error: partial.error,
    redirect_hops: partial.redirect_hops ?? 0,
    blocked_reason: partial.blocked_reason ?? null,
  });

  let current: URL;
  try {
    current = parseUrlOrThrow(officialUrl);
  } catch (e) {
    return fail({ error: String((e as Error).message || e), blocked_reason: String((e as Error).message || e) });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let hops = 0;

  try {
    for (;;) {
      try {
        await assertPublicHostname(current.hostname);
      } catch (e) {
        return fail({
          error: String((e as Error).message || e),
          blocked_reason: String((e as Error).message || e),
          final_url: current.toString(),
          redirect_hops: hops,
        });
      }

      let res: Response;
      try {
        res = await fetch(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: ac.signal,
          headers: {
            'user-agent': 'sales-os-authorized-import/1.1 (+read-only; public enterprise pages only; no intranet)',
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          },
        });
      } catch (e) {
        const name = (e as Error)?.name || '';
        const msg = String((e as Error)?.message || e).slice(0, 160);
        return fail({
          error: name === 'AbortError' ? 'timeout' : msg,
          final_url: current.toString(),
          redirect_hops: hops,
        });
      }

      // Redirect hop
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) {
          return fail({
            error: 'redirect_missing_location',
            http_status: res.status,
            final_url: current.toString(),
            redirect_hops: hops,
          });
        }
        hops += 1;
        if (hops > maxRedirects) {
          return fail({
            error: 'too_many_redirects',
            http_status: res.status,
            final_url: current.toString(),
            redirect_hops: hops,
          });
        }
        let next: URL;
        try {
          next = parseUrlOrThrow(new URL(loc, current).toString());
        } catch (e) {
          return fail({
            error: `redirect_target_invalid:${(e as Error).message || e}`,
            http_status: res.status,
            final_url: current.toString(),
            redirect_hops: hops,
            blocked_reason: String((e as Error).message || e),
          });
        }
        current = next;
        continue;
      }

      const { text, bytes } = await readBodyLimited(res, maxBytes);
      const { title, description } = extractTitleDesc(text);
      const sample = text.slice(0, 4000);

      if (looksLikeErrorPage(res.status, title, sample)) {
        return fail({
          error: `http_${res.status}_or_error_page`,
          http_status: res.status,
          final_url: current.toString(),
          redirect_hops: hops,
          bytes,
        });
      }

      const facts = [title, description].filter(Boolean).join(' — ').trim();
      if (!facts) {
        return fail({
          error: 'empty_extractable_facts',
          http_status: res.status,
          final_url: current.toString(),
          redirect_hops: hops,
          bytes,
        });
      }

      if (res.status < 200 || res.status >= 300) {
        return fail({
          error: `http_${res.status}`,
          http_status: res.status,
          final_url: current.toString(),
          redirect_hops: hops,
          bytes,
        });
      }

      return {
        verification_status: 'fetch_verified',
        http_status: res.status,
        final_url: current.toString(),
        title,
        description,
        facts_excerpt: facts.slice(0, 400),
        bytes,
        error: null,
        redirect_hops: hops,
        blocked_reason: null,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize company official URL for identity merge (host+path, no trailing slash, lowercased). */
export function normalizeCompanyUrl(raw: string): string {
  const u = new URL(raw);
  const host = u.hostname.replace(/\.$/, '').toLowerCase();
  let path = u.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return `${u.protocol}//${host}${path === '/' ? '' : path}`;
}

/** Business-scope merge key: normalized public URL + product code. */
export function publicCompanyMergeKey(officialUrl: string, productCode: string): string {
  return `public_url:${normalizeCompanyUrl(officialUrl)}|product:${productCode}`;
}
