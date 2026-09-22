# 备份 / 恢复可复现结果

> dump 二进制仅存 `var/backups/`（gitignore），**不提交 git**。

## 备份

```bash
bash scripts/backup-db.sh
```

| 项 | 值 |
|---|---|
| 文件名 | `sales_os-20260922-123649.dump`（`var/backups/`，symlink `sales_os-latest.dump`） |
| 大小 | 54K |
| SHA-256 | `e0b0d4c9a06bfdba26c50726758d6ba9791b555a4576f5ca6060408d90d15132` |
| TOC 条目 | `pg_restore -l` → 80 行（含 uuid-ossp、lead_*、consent_grants 等） |

非破坏性可读性检查：

```bash
pg_restore -l var/backups/sales_os-latest.dump | head
```

## 合成 case（持久化探针）

- `case_id`：`8b5f5e1b-6940-401a-b96e-f333f9601ccd`
- 来源：浏览器 E2E（`utm_source=browser_e2e`，`invite=INVSHOT1`）

## 整栈重启

```bash
bash scripts/supervise.sh restart   # api + worker + gateway；未杀其他 cloudflared
```

重启后：

- `GET http://127.0.0.1:3100/health` → ok
- `GET http://127.0.0.1:18180/__ready` → ok，`web_mode=static`
- 同 case 再拉：`stage=NEW`，`utm_source=browser_e2e`，`invite_code=INVSHOT1`，`consent_version=v1.0-2026` → **持久化 PASS**
- 公网临时 URL 落地页/__ready 仍 200；保护口 4173/8080/8765/3000/3001/5173 未动

## 恢复演练（非破坏）

优先不覆盖生产库 `sales_os`：

```bash
# 1) 列表 TOC（只读）
pg_restore -l var/backups/sales_os-YYYYMMDD-HHMMSS.dump

# 2) 恢复到临时库后 drop
createdb -O sales sales_os_restore_test   # 或 psql postgres -c 'CREATE DATABASE ...'
pg_restore --no-owner --no-acl -d postgres://…/sales_os_restore_test var/backups/….dump
psql …/sales_os_restore_test -c "SELECT count(*) FROM lead_cases WHERE id='8b5f5e1b-6940-401a-b96e-f333f9601ccd';"
# → 1；utm=browser_e2e|INVSHOT1
dropdb sales_os_restore_test
```

本次实测：`restore_test case count=1`，随后已 DROP `sales_os_restore_test`。  
**未**对生产 `sales_os` 执行 `scripts/restore-db.sh`（该脚本会 `--clean` 覆盖目标库）。

覆盖生产恢复命令（仅文档，勿在演示高峰误跑）：

```bash
bash scripts/restore-db.sh var/backups/sales_os-YYYYMMDD-HHMMSS.dump
```
