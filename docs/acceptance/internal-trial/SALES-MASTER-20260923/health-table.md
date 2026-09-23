| Check | Result |
|---|---|
| postgres healthy (compose) | PASS |
| redis healthy (compose) | PASS |
| API direct :39300/health | PASS |
| Web proxied :19280/api/health | PASS |
| Web static / HTTP 200 | 200 (not accepted alone) |
| Chromium typed UI login | PASS |
| public_web_sample imports | 4 /5 |
| e2e internal-sales | PASS |
| e2e followup-reminders | PASS |
| e2e negative/RBAC | PASS |
| compose stop/start persistence | PASS |
