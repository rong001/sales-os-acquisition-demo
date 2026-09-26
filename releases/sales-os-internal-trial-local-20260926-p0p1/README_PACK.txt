SALES-FOLLOWUP-20260926-P0P1 trial pack
Unpack over existing sales-os-app tree. KEEP .env.native and .data/.
Prefer changed-files overlay: sales-os-internal-trial-local-20260926-p0p1-overlay.tar.gz (see DIFF-OVERLAY.md).
Rebuild after overlay (dist is gitignored):
  npm run build -w @sales-os/api
  npm run build -w @sales-os/worker
  npm run build -w @sales-os/web
Windows native:
  .\scripts\windows\native\Start-InternalTrial-Native.ps1
  .\scripts\windows\native\Test-InternalTrial-Native.ps1
  .\scripts\windows\native\Invoke-BusinessAcceptance.ps1
product_green=NO while UI SKIP. See docs/.../SALES-FOLLOWUP-20260926-P0P1/
CALL_PROVIDER=mock WECOM_MODE=mock by default; REAL fails closed without keys.
Never touch Sub2API ports 15432/16379.

Pack SHA256: ec546299f33faec3b31a1ee2d46c44568a657cb0d39a95bb877c0072e5b08d48
Overlay SHA256: 8c563b1cd58ee493b1786396cca11cd9b83a43649fcd2ce8d03d06954ad0634f
