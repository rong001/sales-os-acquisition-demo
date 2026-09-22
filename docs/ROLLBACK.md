# 回滚

## 应用进程

```bash
bash scripts/supervise.sh stop
# 检出上一已知良好 commit 后
npm run build
bash scripts/supervise.sh start
bash scripts/supervise.sh status
```

健康：`http://127.0.0.1:3100/health` · `http://127.0.0.1:18180/__ready`

## 公网隧道

- **临时 quick tunnel**：`bash scripts/supervise.sh stop-cloudflared` 后重跑 `scripts/deploy-public-https.sh`（URL 会变，仍标临时）。
- **Named Tunnel**：停掉 `deploy-named-tunnel.sh` 进程；必要时改回 quick tunnel。勿动其他项目 cloudflared。

## 数据库

见 `docs/STABLE_DEPLOY.md`：

```bash
bash scripts/backup-db.sh
bash scripts/restore-db.sh var/backups/sales_os-YYYYMMDD-HHMMSS.dump
```

仅操作 `sales_os` 库。恢复后 `bash scripts/supervise.sh restart` 并复跑 E2E。
