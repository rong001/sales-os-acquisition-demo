# 备份 / 恢复可复现结果（toc-prod）

> dump 二进制仅存 `var/backups/`（gitignore），**不提交 git**。  
> 合成数据；手机号脱敏。时间戳：2026-09-22T07:09:59Z（`sales_os-20260922-150959.dump`）。

## 自助命令（可复制）

```bash
bash scripts/backup-db.sh
# → var/backups/sales_os-YYYYMMDD-HHMMSS.dump ；symlink → sales_os-latest.dump

pg_restore -l var/backups/sales_os-latest.dump | head

# 可选：恢复到临时库（勿覆盖生产 sales_os）
# 按 .env 中 DATABASE_URL 改写用户/主机/密码：
psql postgres://sales:***@127.0.0.1:5432/postgres -c 'DROP DATABASE IF EXISTS sales_os_restore_test;'
psql postgres://sales:***@127.0.0.1:5432/postgres -c 'CREATE DATABASE sales_os_restore_test OWNER sales;'
pg_restore --no-owner --no-acl -d postgres://sales:***@127.0.0.1:5432/sales_os_restore_test \
  var/backups/sales_os-latest.dump
psql postgres://sales:***@127.0.0.1:5432/sales_os_restore_test \
  -c "SELECT count(*) FROM lead_cases WHERE id='edcbc252-e3ed-49e3-939a-3a03cf896d6d';"
# → 1
psql postgres://sales:***@127.0.0.1:5432/postgres -c 'DROP DATABASE sales_os_restore_test;'
```

覆盖生产恢复（**仅文档**；演示高峰勿跑）：

```bash
bash scripts/restore-db.sh var/backups/sales_os-YYYYMMDD-HHMMSS.dump
```

## 本次实测

| 项 | 值 |
|---|---|
| 文件名 | `sales_os-20260922-150959.dump`（`var/backups/`，symlink `sales_os-latest.dump`） |
| 大小 | ~96K |
| SHA-256 | `46dce2107a8519038b1b0f3c6bd02810aae550c5c8030ea35e248dfdbb65175f` |
| TOC | `pg_restore -l` ≈ 80 条（含 uuid-ossp、lead_*、consent_grants 等）；样例见 `backup-toc-sample.txt` |
| restore_test | E2E case `a6ccf32c-…` count=1；浏览器 case `edcbc252-…` count=1；随后已 DROP `sales_os_restore_test` |
| 整栈重启 | `bash scripts/supervise.sh restart` 后 `after-restart.json`：同 case `edcbc252-…` stage=NEW，utm_source=selftest，invite=SELFTEST1，consent_version=v1.0-2026 |

**未**对生产 `sales_os` 执行破坏性 `--clean` 恢复。
