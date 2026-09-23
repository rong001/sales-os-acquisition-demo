# SSRF / public-only fetch notes — SALES-FOLLOWUP-20260923-1217

## Policy

- Only `http:` / `https:` public enterprise sources
- Reject: RFC1918, loopback, link-local, CGNAT, metadata `169.254.169.254`, localhost / `.local` / `.internal` names, literal private IPs
- Every redirect hop: resolve DNS + IP check before fetch
- Body size cap 512KiB; timeout ~12s; max 5 redirects
- Manager auth ≠ permission to hit intranet/metadata
- No outbound email/phone/DM; consent UNKNOWN stays UNKNOWN

## Bot probe

- `http://127.0.0.1:3100/health` import → `verification_status=fetch_failed`, facts=`UNKNOWN` (PASS `ssrf-reject-loopback`)
- Unit: `isNonPublicIp` covers 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16

## Implementation

`apps/api/src/common/public-fetch.ts` — used by `importAuthorizedPublicList`.
