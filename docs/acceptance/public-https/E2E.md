# 公网 HTTPS E2E（获客 OS）

**日期**: 2026-09-22  
**结果**: **PASS**  
**公网（临时）**: https://cons-make-empire-treaty.trycloudflare.com  
**模式**: 生产静态 gateway（`apps/web/dist`）+ supervise；证据亦见 `docs/acceptance/toc-stable/`。

隔离：未动 4173/8080/8765/3000/3001/5173。trycloudflare URL 临时。
