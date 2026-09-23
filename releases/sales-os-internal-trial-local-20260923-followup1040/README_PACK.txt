Sales OS internal trial pack — sales-os-internal-trial-local-20260923-followup1040
Git tip included in tree: 276f46e07625fc3b8b5209d43c754f8cc510cefb
Short: 276f46e
See START_WINDOWS.md (Docker path A + native path B) and START_INTERNAL.md.
Evidence: sales-os-app/docs/acceptance/internal-trial/SALES-FOLLOWUP-20260923-1040/
Parent pack: sales-os-internal-trial-local-20260923-followup1016
Windows native PASS: NOT claimed — retest on user PC required.
Fixes vs followup1016: pg_ctl/initdb pipe Out-Null hang (Invoke-NativeToolProcess file redirects + timeout);
default ports 55433/56380/39300/19280 (avoid Sub2API/Garnet 15432/16379); port-collision FAIL without kill.
UNPACK: tar over existing source; KEEP your .env.native and .data/ (secrets + trial DB).
