# ToC 获客验收（toc-prod）

日期：2026-09-22  
结论：**能力已交付 / 固定域名待用户** — 不标「生产稳定已完成」或「可售」。

## 五项复测

| 项 | 结果 | 证据 |
|---|---|---|
| 公开页（演示≠合同 + 诚实边界 + `/c/:slug`） | PASS | `public-health.json`、公网 landing/content 200；产品 tip 抢票 `9ee80b0` / USGate `809bf29`+`53a9afb` |
| 同意与追踪（同意拒收、hash/IP/UA、UTM、限流 429） | PASS | `negative/` 无同意 400、缺字段 400、限流 429；`after-restart.json` consent_hash |
| 持久线索流转（分配/跟进/预约/结果/重启） | PASS | `e2e-logs/`、`after-restart.json`、`backup-restore.md`、`17-mark-result.json` |
| 权限（viewer 越权 + 审计脱敏） | PASS | `negative/09-21`、`15-admin-audits` / `16-viewer-audits` |
| 部署（固定域名） | **未完成** | 仅临时 trycloudflare（`PUBLIC_URL.txt`）；Named Tunnel 占位见 `docs/PROD_HTTPS.md`；阻塞见 `docs/USER_ACTIONS.md` |

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

见 `PUBLIC_URL.txt`（trycloudflare，**临时**）。公网 health / 落地页 / 内容页 / 无同意 400 已复测。

## 诚实产品状态（写入矩阵与落地页）

- 抢票：火车 live；机票不可用；邮件未实达；tip `9ee80b0`
- USGate：MOCK 门户；真面板/真机未验收；demo`809bf29` client`53a9afb`；不可标可售
