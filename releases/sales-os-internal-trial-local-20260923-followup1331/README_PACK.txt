SALES-FOLLOWUP-20260923-1331 trial pack
Unpack over existing sales-os-app tree. KEEP .env.native and .data/.
Prefer changed-files overlay: sales-os-internal-trial-local-20260923-followup1331-overlay.tar.gz (see DIFF-OVERLAY.md).
Rebuild after overlay (dist is gitignored):
  npm run build -w @sales-os/api
  npm run build -w @sales-os/worker
  npm run build -w @sales-os/web
Windows native:
  .\scripts\windows\native\Start-InternalTrial-Native.ps1
  .\scripts\windows\native\Test-InternalTrial-Native.ps1
  .\scripts\windows\native\Invoke-BusinessAcceptance.ps1
product_green=NO while UI SKIP. See docs/.../SALES-FOLLOWUP-20260923-1331/
Pack SHA256: ea578dbe1b5393f20d07f01d55d41870da351b1b0f17cf457f489d8b552efab5
Overlay SHA256: 105b1687d483f2a972d05644cc38c19fcf2cb52518b7f6017cc654dc34148421
