# 独立验收勾选表（toc-prod）

> 供**用户本人**勾选。默认未勾项表示**尚未通过**。  
> Agent 侧报告与脱敏证据**不能**代替本表勾选。  
> 整体结论在全部关键项（含固定域名与独立端到端）勾选前，应写：**临时演示可维护；固定域名与独立端到端验收未通过**。

日期：__________　核验人：__________　公网 URL（来自 `PUBLIC_URL.txt`）：__________

## A. 不依赖固定域名（可对临时 trycloudflare / 本机复测）

| # | 项 | 用户勾选 | 备注 / 证据路径 |
|---|---|---|---|
| A1 | 读到 `PUBLIC_URL.txt`；根路径 HTTPS 200 | ☐ | |
| A2 | `/p/ticket-grab`、`/p/usgate` HTTPS 200 | ☐ | |
| A3 | `/api/health`、`/__ready` HTTPS 200 | ☐ | `public-health.json` / `public-ready.json` |
| A4 | 浏览器 ticket-grab：无同意不可提交；有同意可提交；记下短号 | ☐ | `SELF_RETEST.md` §1；`browser/` |
| A5 | 浏览器 usgate：同上 | ☐ | |
| A6 | agent 登录后可见 UTM + invite + consent | ☐ | `SELF_RETEST.md` §2 |
| A7 | qualify → assign → activity → mock reach → appoint confirm | ☐ | |
| A8 | admin funnel 可见 | ☐ | |
| A9 | 无同意 intake → 400；viewer 写操作 → 403 | ☐ | `negative/` |
| A10 | `supervise.sh restart` 后同 case 仍在 | ☐ | `after-restart.json` |
| A11 | `backup-db.sh` + `pg_restore -l`；可选 restore 到 `sales_os_restore_test`（未覆盖生产） | ☐ | `backup-restore.md` |

## B. 固定域名（默认未通过）

| # | 项 | 用户勾选 | 备注 |
|---|---|---|---|
| B1 | **域名与 DNS/Cloudflare 条件已由用户确认** | ☐ | 禁止替用户断言「暂无/没有域名」 |
| B2 | Named Tunnel 凭证已安装；`deploy-named-tunnel.sh` 已启用 | ☐ | `docs/PROD_HTTPS.md` |
| B3 | 固定主机名 HTTPS 根 / 两落地页 / health / `__ready` 200 | ☐ | |
| B4 | 矩阵「线上演示」已改为固定域名且去掉「临时」 | ☐ | **仅当 B3 真实可访问后** |

> **B 区默认全部未勾** → **固定域名验收未通过**。

## C. 独立端到端（默认未通过）

| # | 项 | 用户勾选 | 备注 |
|---|---|---|---|
| C1 | 上表 A 区由用户本人（非仅 agent 报告）完成并勾选 | ☐ | |
| C2 | 浏览器表单 + 线索流转 + 备份恢复均由用户本人复测 | ☐ | 可对照 `SELF_RETEST.md` |
| C3 | 不依赖 agent 口头「PASS」即可向第三方复现 | ☐ | |

> **C 区默认全部未勾** → **独立端到端验收未通过**。

## 结论栏（勿预填为通过）

- [ ] 仅临时演示可维护（A 区）  
- [ ] 固定域名已通过（B 区）← **默认不勾**  
- [ ] 独立端到端已通过（C 区）← **默认不勾**  

**当前仓库文档口径：临时演示可维护；固定域名与独立端到端验收未通过。**
