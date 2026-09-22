# 备份 / 重启持久化证据（toc-prod）

- 备份命令：`bash scripts/backup-db.sh` → `var/backups/sales_os-latest.dump`
- 恢复命令：`bash scripts/restore-db.sh <dump>`（见 `docs/STABLE_DEPLOY.md` / `docs/ROLLBACK.md`）
- 复测：`bash scripts/supervise.sh restart` 后案件 `ca2d8019-a6a3-4ae2-9290-455c392a33d8` 仍在，stage 与 consents 保留（见下方）。
- 时间：2026-09-22T07:01:57Z

```
AFTER_RESTART case=ca2d8019-a6a3-4ae2-9290-455c392a33d8
```
