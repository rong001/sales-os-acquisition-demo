/**
 * Public-only HTTP(S) fetch for authorized enterprise source verification.
 * Rejects non-public targets (RFC1918, loopback, link-local, metadata, localhost names).
 * Validates every redirect hop (DNS resolve + IP check) and PINs the verified IP to
 * the TCP/TLS connection while keeping Host / SNI for the original hostname.
 * Manager auth does NOT grant intranet/metadata access.
 */
import * as dns from 'dns/promises';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { URL } from 'url';

export type PublicFetchStatus =
  | 'fetch_verified'
  | 'fetch_failed'
  | 'pending_verification'
  | 'source_provided';

export type PublicFetchResult = {
  verification_status: 'fetch_failed' | 'fetch_verified';
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

/**
 * Title-level error heuristics. NEVER match bare "cloudflare" / "akamai" —
 * legitimate corporate titles ("Cloudflare, Inc.", "Built on Cloudflare") must pass.
 * Challenge / block page titles only.
 */
const ERROR_TITLE_RE =
  /just a moment|attention required|access denied|forbidden|too many requests|rate limit|error\s*\d{3}|service unavailable|captcha|blocked|unauthorized|not found|404|429|503|502|500|reference\s*#\d+|access has been blocked|the requested url was rejected/i;

/** Body markers for CDN challenge / reference block pages (not company branding). */
const CHALLENGE_BODY_RE =
  /cf-browser-verification|challenge-platform|cdn-cgi\/challenge|cdn-cgi\/l\/chk_|__cf_chl|cf-challenge|cloudflare ray id[\s\S]{0,80}(challenge|attention required|just a moment)|attention required!?\s*\|\s*cloudflare|akamai\s*(reference|block|denied|bot manager)|errors\.edgesuite\.net|access denied[\s\S]{0,40}akamai|gws_rd_block/i;

export type LookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<{ address: string; family: number }[]>;

export type PublicFetchDeps = {
  lookup?: LookupFn;
  /** Injected transport for offline/mock tests. */
  pinnedRequest?: (
    url: URL,
    pinnedIp: string,
    opts: { method: string; headers: Record<string, string>; signal?: AbortSignal },
  ) => Promise<{ status: number; headers: { get(name: string): string | null }; bodyText: () => Promise<string> }>;
};

function expandIpv6(ip: string): number[] | null {
  const lower = ip.toLowerCase().trim();
  if (!lower.includes(':')) return null;
  // Strip zone id
  const bare = lower.split('%')[0];
  // IPv4-mapped dotted tail handled separately
  let s = bare;
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);

  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  if (parts.length === 1) {
    if (head.length !== 8) return null;
  }
  // Handle dotted IPv4 at end of last group (e.g. ::ffff:127.0.0.1)
  const convertLastV4 = (groups: string[]): string[] | null => {
    if (!groups.length) return groups;
    const last = groups[groups.length - 1];
    if (last.includes('.')) {
      const v4 = last.split('.').map((x) => Number(x));
      if (v4.length !== 4 || v4.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
      groups = groups.slice(0, -1);
      groups.push(((v4[0] << 8) | v4[1]).toString(16));
      groups.push(((v4[2] << 8) | v4[3]).toString(16));
    }
    return groups;
  };
  let h = convertLastV4([...head]);
  let t = convertLastV4([...tail]);
  if (!h || !t) return null;
  const missing = 8 - (h.length + t.length);
  if (parts.length === 2) {
    if (missing < 0) return null;
    const mid = Array(missing).fill('0');
    h = [...h, ...mid, ...t];
  } else if (h.length !== 8) {
    return null;
  }
  const out: number[] = [];
  for (const g of h) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out.length === 8 ? out : null;
}

/** Decode IPv4-mapped IPv6 including hex form ::ffff:7f00:1 → 127.0.0.1 */
export function ipv4MappedFromIpv6(ip: string): string | null {
  const hextets = expandIpv6(ip);
  if (!hextets) {
    // Fallback: ::ffff:dotted
    const lower = ip.toLowerCase();
    const m = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (m && net.isIP(m[1]) === 4) return m[1];
    return null;
  }
  // ::ffff:x:x → hextets [0,0,0,0,0,0xffff,hi,lo]
  if (
    hextets[0] === 0 && hextets[1] === 0 && hextets[2] === 0
    && hextets[3] === 0 && hextets[4] === 0 && hextets[5] === 0xffff
  ) {
    const a = (hextets[6] >> 8) & 0xff;
    const b = hextets[6] & 0xff;
    const c = (hextets[7] >> 8) & 0xff;
    const d = hextets[7] & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }
  return null;
}

function isIpv4Private(ip: string): boolean {
  const parts = ip.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // this network
  if (a === 169 && b === 254) return true; // link-local / AWS metadata
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

function isIpv6NonPublic(ip: string): boolean {
  const mapped = ipv4MappedFromIpv6(ip);
  if (mapped) return isIpv4Private(mapped);

  const hextets = expandIpv6(ip);
  if (!hextets) return true; // unparseable → reject

  // :: and ::1
  if (hextets.every((h) => h === 0)) return true; // unspecified
  if (
    hextets[0] === 0 && hextets[1] === 0 && hextets[2] === 0 && hextets[3] === 0
    && hextets[4] === 0 && hextets[5] === 0 && hextets[6] === 0 && hextets[7] === 1
  ) return true; // loopback

  const h0 = hextets[0];
  // fe80::/10 link-local (fe80–febf)
  if ((h0 & 0xffc0) === 0xfe80) return true;
  // fc00::/7 unique-local (fc00–fdff)
  if ((h0 & 0xfe00) === 0xfc00) return true;
  // ff00::/8 multicast
  if ((h0 & 0xff00) === 0xff00) return true;
  // 2001:db8::/32 documentation
  if (h0 === 0x2001 && hextets[1] === 0xdb8) return true;
  // 2001:2::/48 benchmarking / 100::/64 discard — treat as non-public
  if (h0 === 0x100 && hextets[1] === 0 && hextets[2] === 0 && hextets[3] === 0) return true;

  return false;
}

export function isNonPublicIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase().split('%')[0];
  const kind = net.isIP(trimmed);
  if (kind === 4) return isIpv4Private(trimmed);
  if (kind === 6) return isIpv6NonPublic(trimmed);
  // net.isIP may miss some forms; try IPv6 expand / mapped anyway
  if (trimmed.includes(':')) return isIpv6NonPublic(trimmed);
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
  if (net.isIP(h)) {
    if (isNonPublicIp(h)) return `blocked_literal_ip:${h}`;
  }
  return null;
}

/**
 * Resolve hostname, reject if any address is non-public, return preferred pinned IP.
 */
export async function resolveAndPinPublicIp(
  hostname: string,
  lookup: LookupFn = (h, o) => dns.lookup(h, o),
): Promise<string> {
  const blocked = hostnameBlocked(hostname);
  if (blocked) throw new Error(blocked);
  if (net.isIP(hostname)) {
    if (isNonPublicIp(hostname)) throw new Error(`blocked_literal_ip:${hostname}`);
    return hostname;
  }
  let records: { address: string; family: number }[] = [];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(`dns_resolve_failed:${(e as Error).message || e}`);
  }
  if (!records.length) throw new Error('dns_empty');
  for (const r of records) {
    if (isNonPublicIp(r.address)) {
      throw new Error(`blocked_resolved_ip:${r.address}`);
    }
  }
  // Prefer IPv4 for pinning stability
  const v4 = records.find((r) => net.isIP(r.address) === 4);
  return (v4 || records[0]).address;
}

export async function assertPublicHostname(
  hostname: string,
  lookup?: LookupFn,
): Promise<void> {
  await resolveAndPinPublicIp(hostname, lookup);
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

/**
 * True only for HTTP error statuses or SPECIFIC challenge/block evidence.
 * Titles that merely contain the strings "cloudflare" / "akamai" are NOT errors.
 */
export function looksLikeErrorPage(httpStatus: number, title: string | null, bodySample: string): boolean {
  if (httpStatus === 429 || httpStatus === 403 || httpStatus === 401 || httpStatus >= 500) return true;
  if (httpStatus >= 400) return true;
  if (title && ERROR_TITLE_RE.test(title)) return true;
  if (CHALLENGE_BODY_RE.test(bodySample)) return true;
  return false;
}

/** Exported for unit tests — title honesty without network. */
export function titleLooksLikeCdnChallenge(title: string | null): boolean {
  if (!title) return false;
  return ERROR_TITLE_RE.test(title);
}

async function readBodyLimited(
  bodyText: string,
  maxBytes: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const buf = Buffer.from(bodyText, 'utf8');
  if (buf.length > maxBytes) {
    return { text: buf.slice(0, maxBytes).toString('utf8'), bytes: maxBytes, truncated: true };
  }
  return { text: bodyText, bytes: buf.length, truncated: false };
}

type PinnedHttpResult = {
  status: number;
  headers: { get(name: string): string | null };
  bodyText: () => Promise<string>;
};

/**
 * HTTP(S) request that dials `pinnedIp` while presenting Host + TLS SNI for `url.hostname`.
 * Prevents DNS rebinding between validation and connect.
 */
export function pinnedHttpRequest(
  url: URL,
  pinnedIp: string,
  opts: { method?: string; headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number },
): Promise<PinnedHttpResult> {
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const family = net.isIP(pinnedIp) === 6 ? 6 : 4;
  const agent = new lib.Agent({
    keepAlive: false,
    lookup: (_hostname, _options, callback) => {
      // Always return the pre-validated IP (pin). Host/SNI stay on original hostname.
      (callback as (err: Error | null, address: string, family: number) => void)(null, pinnedIp, family);
    },
  });

  const headers: Record<string, string> = {
    host: url.host,
    ...(opts.headers || {}),
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname, // SNI + Host identity (lookup pins dial IP)
        servername: url.hostname, // explicit SNI for TLS
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: opts.method || 'GET',
        headers,
        agent,
        timeout: opts.timeoutMs,
        // family hint
        family,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const headerGet = (name: string) => {
            const v = res.headers[name.toLowerCase()];
            if (Array.isArray(v)) return v[0] ?? null;
            return v ?? null;
          };
          resolve({
            status: res.statusCode || 0,
            headers: { get: headerGet },
            bodyText: async () => buf.toString('utf8'),
          });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    if (opts.signal) {
      if (opts.signal.aborted) {
        req.destroy(new Error('AbortError'));
        return;
      }
      opts.signal.addEventListener('abort', () => req.destroy(new Error('AbortError')), { once: true });
    }
    req.end();
  });
}

export async function fetchPublicSource(
  officialUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number },
  deps?: PublicFetchDeps,
): Promise<PublicFetchResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const lookup: LookupFn = deps?.lookup || ((h, o) => dns.lookup(h, o));
  const doRequest = deps?.pinnedRequest || pinnedHttpRequest;

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
      let pinnedIp: string;
      try {
        // Re-resolve + re-validate + pin on EVERY hop (closes DNS rebinding window)
        pinnedIp = await resolveAndPinPublicIp(current.hostname, lookup);
      } catch (e) {
        return fail({
          error: String((e as Error).message || e),
          blocked_reason: String((e as Error).message || e),
          final_url: current.toString(),
          redirect_hops: hops,
        });
      }

      let res: PinnedHttpResult;
      try {
        res = await doRequest(current, pinnedIp, {
          method: 'GET',
          signal: ac.signal,
          timeoutMs,
          headers: {
            'user-agent': 'sales-os-authorized-import/1.2 (+read-only; public enterprise pages only; no intranet; dns-pinned)',
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            // Host set inside pinnedHttpRequest from url.host
          },
        });
      } catch (e) {
        const msg = String((e as Error)?.message || e).slice(0, 160);
        const name = (e as Error)?.name || '';
        return fail({
          error: name === 'AbortError' || /abort|timeout/i.test(msg) ? (msg.includes('timeout') ? 'timeout' : 'timeout') : msg,
          final_url: current.toString(),
          redirect_hops: hops,
        });
      }

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

      const rawText = await res.bodyText();
      const { text, bytes } = await readBodyLimited(rawText, maxBytes);
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

export type SourceHistoryEntry = {
  source_id: string;
  batch_id: string;
  fetch_time: string;
  verification_status: string;
};

/**
 * Cap history while retaining latest, last-verified, and status-transition markers.
 */
export function retainSourceHistory(
  history: SourceHistoryEntry[],
  max = 20,
): SourceHistoryEntry[] {
  if (history.length <= max) return history;
  const byKey = new Map<string, SourceHistoryEntry>();
  const keyOf = (e: SourceHistoryEntry, tag: string) => `${tag}:${e.source_id}:${e.fetch_time}`;

  const latest = history[history.length - 1];
  byKey.set(keyOf(latest, 'latest'), latest);

  const lastVerified = [...history].reverse().find((h) => h.verification_status === 'fetch_verified');
  if (lastVerified) byKey.set(keyOf(lastVerified, 'verified'), lastVerified);

  let prev: string | null = null;
  for (const h of history) {
    if (h.verification_status !== prev) {
      byKey.set(keyOf(h, 'transition'), h);
      prev = h.verification_status;
    }
  }

  // Fill remaining slots with most recent entries
  for (let i = history.length - 1; i >= 0 && byKey.size < max; i--) {
    const h = history[i];
    byKey.set(keyOf(h, 'recent'), h);
  }

  const kept = [...byKey.values()];
  kept.sort((a, b) => String(a.fetch_time).localeCompare(String(b.fetch_time)));
  // If still over max (unlikely), keep tail
  return kept.length > max ? kept.slice(-max) : kept;
}

export function buildVerificationExplanation(opts: {
  current: string;
  historicallyVerified: boolean;
}): string {
  if (opts.current === 'fetch_verified') {
    return 'latest fetch verified — safe to treat page facts as current';
  }
  if (opts.historicallyVerified && opts.current === 'fetch_failed') {
    return 'previously verified, latest fetch failed — do not treat failed page as current facts';
  }
  if (opts.historicallyVerified) {
    return `previously verified, current status=${opts.current} — use current status for facts trust`;
  }
  if (opts.current === 'fetch_failed') {
    return 'latest fetch failed — facts UNKNOWN; do not treat error page as company facts';
  }
  if (opts.current === 'source_provided') {
    return 'source URL provided; live fetch skipped or not yet verified';
  }
  return `current status=${opts.current}`;
}
