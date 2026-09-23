SALES-FOLLOWUP-20260923-1217 trial pack
Unpack over existing sales-os-app tree. KEEP .env.native and .data/.
Rebuild after overlay (dist is gitignored):
  npm run build -w @sales-os/api
  npm run build -w @sales-os/web
Windows native:
  .\scripts\windows\native\Start-InternalTrial-Native.ps1
  .\scripts\windows\native\Test-InternalTrial-Native.ps1
  .\scripts\windows\native\Invoke-BusinessAcceptance.ps1
Health contract: /api/health = readiness (PG/Redis); /api/health/live = liveness.
See docs/acceptance/internal-trial/SALES-FOLLOWUP-20260923-1217/
