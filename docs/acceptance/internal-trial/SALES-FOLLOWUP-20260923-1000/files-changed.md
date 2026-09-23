# Files changed (this followup)

- `apps/api/src/main.ts` — `API_HOST` bind
- `scripts/windows/native/NativeCommon.ps1` — **new** shared helpers
- `scripts/windows/native/Start-InternalTrial-Native.ps1` — logging, worker, Redis 5+, API_HOST, cleanup
- `scripts/windows/native/Stop-InternalTrial-Native.ps1` — owned-PID Stop, path safety
- `scripts/windows/native/Test-InternalTrial-Native.ps1` — Redis 5+ + worker checks
- `scripts/windows/native/Fetch-NativeDeps.ps1` — honest checksum policy; Redis 5+ messaging
- `scripts/windows/native/README.md` — 中文说明
- `scripts/windows/native/.env.native.example` — API_HOST + port notes
- `START_WINDOWS.md` — API_HOST / Redis 5+ / Node / checksum
- `.env.example` — API_HOST comment
- `docs/acceptance/internal-trial/SALES-FOLLOWUP-20260923-1000/**` — evidence
