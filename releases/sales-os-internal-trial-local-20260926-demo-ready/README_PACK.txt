SALES-FOLLOWUP-20260926-DEMO trial pack (demo-ready)
Unpack over existing sales-os-app tree. KEEP .env.native and .data.
Prefer changed-files overlay: sales-os-internal-trial-local-20260926-demo-ready-overlay.tar.gz (see DIFF-OVERLAY.md).

Rebuild after overlay (dist is gitignored):
  npm run build -w @sales-os/api
  npm run build -w @sales-os/worker
  npm run build -w @sales-os/web

Demo:
  npm run seed
  npm run seed:demo
  npm run smoke:demo

Accounts: agent@ / agent2@ / manager@ / admin@ / viewer@demo.local
Passwords from local .env / .env.native DEMO_*_PASSWORD only.

product_green=NO while UI SKIP. See docs/.../SALES-FOLLOWUP-20260926-DEMO/
CALL_PROVIDER=mock WECOM_MODE=mock by default; REAL fails closed without keys.
Never touch Sub2API ports 15432/16379.

Pack SHA256: edb37e8ab25df2f8ff3992bdbfa25d429b65b9a3fae8d9997367d074c3d859b5
Pack bytes: 5018643
Overlay SHA256: 00a12e9520d14157d3ca8abc45499fa6ec8bca0e440f66cd04ba083457beeaad
Overlay bytes: 32919
