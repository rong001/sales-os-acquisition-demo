# SSRF / public-only fetch — SALES-FOLLOWUP-20260923-1331

Extends followup1217 SSRF notes.

## Policy (unchanged + pin)

- Only `http:` / `https:` public enterprise sources
- Reject: RFC1918, loopback, link-local **fe80::/10**, ULA fc00::/7, CGNAT, metadata `169.254.169.254`, localhost / `.local` / `.internal`, literal private IPs
- IPv4-mapped IPv6 including **hex** forms (`::ffff:7f00:1`, `::ffff:a00:1`, …)
- Every redirect hop: DNS resolve + IP check + **PIN** dial IP; Host/SNI = original hostname
- Body 512KiB; timeout ~12s; max 5 redirects
- No real test traffic to metadata/intranet; offline mocks for rebinding

## Title honesty

- Do **not** reject titles merely containing `cloudflare` / `akamai`
- Challenge evidence only (title phrases + body markers)

## Implementation

`apps/api/src/common/public-fetch.ts` — `resolveAndPinPublicIp`, `pinnedHttpRequest`, `looksLikeErrorPage`.
