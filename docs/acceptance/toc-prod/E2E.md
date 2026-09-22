# ToC 获客验收（toc-prod）

日期：2026-09-22  
结论：**临时演示可维护；固定域名与独立端到端验收未通过** — 不标「能力已交付」暗示整体完成，亦不标「生产稳定已完成」或「可售」。

> 自助复测步骤见 [`SELF_RETEST.md`](./SELF_RETEST.md)。独立勾选表见 [`INDEPENDENT_CHECKLIST.md`](./INDEPENDENT_CHECKLIST.md)。

## 五项复测（agent 侧 + 脱敏证据；≠ 用户独立端到端通过）

| 项 | 结果 | 证据 |
|---|---|---|
| 公开页（演示≠合同 + 诚实边界 + `/c/:slug`） | PASS（临时公网） | `public-health.json`、`public-ready.json`、landing headers；产品 tip 抢票 `9ee80b0` / USGate `809bf29`+`53a9afb` |
| 同意与追踪（同意拒收、hash/IP/UA、UTM、限流 429） | PASS（本机 API） | `negative/` 无同意 400、缺字段 400、限流 429；`browser/case-source-redacted.json` |
| 持久线索流转（分配/跟进/预约/结果/重启） | PASS（本机 API） | `e2e-logs/`、`after-restart.json`、`backup-restore.md` |
| 权限（viewer 越权 + 审计脱敏） | PASS（本机 API） | `negative/` viewer 写操作 403、审计列表 |
| 部署（固定域名） | **未通过** | 仅临时 trycloudflare（`PUBLIC_URL.txt`）；**固定域名未启用（条件待用户确认）**；Named Tunnel 占位见 `docs/PROD_HTTPS.md`；步骤见 `docs/USER_ACTIONS.md` |

## 正例

```bash
API_BASE=http://127.0.0.1:3100 OUT_DIR=docs/acceptance/toc-prod/e2e-logs bash scripts/e2e-acquisition.sh
# → E2E_ACQUISITION_OK
```

## 反例 / 限流 / 审计 / 转化

```bash
API_BASE=http://127.0.0.1:3100 OUT_DIR=docs/acceptance/toc-prod/negative bash scripts/e2e-negative.sh
# → E2E_NEGATIVE_OK + E2E_NEGATIVE_EXTENDED_OK
```

## 邮件未送达

无 SMTP：`email-undelivered.json` → `label=UNDELIVERED_NO_SMTP`（非成功 MOCK）。

## 公网临时隧道

见 `PUBLIC_URL.txt`（trycloudflare，**临时**）。公网根 / 两落地页 / `api/health` / `__ready` HTTPS 200 已复测（用户亦已独立核验 a0a4cd3）。浏览器表单与线索流转请按 `SELF_RETEST.md` 自助复测。

## 诚实产品状态（写入矩阵与落地页）

- 抢票：火车 live；机票不可用；邮件未实达；tip `9ee80b0`
- USGate：MOCK 门户；真面板/真机未验收；demo`809bf29` client`53a9afb`；不可标可售
