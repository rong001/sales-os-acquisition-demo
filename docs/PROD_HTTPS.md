# 固定域名生产 HTTPS（Named Tunnel）

> 本文件为**可审查配置与脚本占位**。  
> **域名与 DNS/Cloudflare 条件待用户确认** — 在用户确认并完成启用前，**不得**声称已有固定生产域名。  
> 固定域名未启用（条件待用户确认）。Named Tunnel 占位已备，启用前须用户确认域名与 DNS/Cloudflare。  
> 当前公网演示仍为 **临时** trycloudflare（见 `docs/acceptance/*/PUBLIC_URL.txt`）。

## 架构

```
浏览器 → https://DOMAIN → Cloudflare Named Tunnel
       → 本机 cloudflared → http://127.0.0.1:18180 (gateway)
       → /api/* → :3100 · 其余 → apps/web/dist
```

端口硬约束：仅 API **3100**、gateway **127.0.0.1:18180**、Postgres/Redis。勿占 4173/8080/8765/3000/3001/5173 及其他项目 cloudflared。

## 配置文件

| 文件 | 用途 |
|---|---|
| `deploy/cloudflared-named-tunnel.example.yml` | Named Tunnel 示例（占位 DOMAIN / TUNNEL_ID） |
| `scripts/deploy-named-tunnel.sh` | 安装凭证路径检查 + 启动（不写死密钥） |

## 用户侧步骤（条件待确认）

见 `docs/USER_ACTIONS.md`：按「若持有域名 / 若 DNS 在 CF / 若否 / 若已有凭证」分支执行，勿假定用户没有域名。

摘要：

1. Cloudflare 账号登录（本环境无 1Password Cloudflare）
2. **若持有域名**：DNS CNAME → `<TUNNEL_ID>.cfargotunnel.com`（或按控制台）
3. 创建 Named Tunnel，下载凭证 JSON 到本机私有路径（**勿提交 git**）
4. 复制 example yml，替换 `DOMAIN` / `TUNNEL_ID` / `credentials-file`
5. `bash scripts/deploy-named-tunnel.sh`（停用 quick tunnel）
6. 用户确认固定域名可访问后，再更新矩阵「线上演示」并去掉「临时」标注

## 回滚

见 `docs/ROLLBACK.md`。数据库备份/恢复见 `docs/STABLE_DEPLOY.md`。
