# 固定域名生产 HTTPS（Named Tunnel）

> 本文件为**可审查配置与脚本占位**。在用户提供域名 / DNS / Cloudflare 凭证前，**不得**声称已有固定生产域名。  
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

## 用户侧步骤（阻塞清单）

见 `docs/USER_ACTIONS.md` 最终 DNS 阻塞：

1. Cloudflare 账号登录（本环境无 1Password Cloudflare）
2. 购买/持有域名，DNS CNAME → `<TUNNEL_ID>.cfargotunnel.com`
3. 创建 Named Tunnel，下载凭证 JSON 到本机私有路径（**勿提交 git**）
4. 复制 example yml，替换 `DOMAIN` / `TUNNEL_ID` / `credentials-file`
5. `bash scripts/deploy-named-tunnel.sh`（停用 quick tunnel）
6. 更新矩阵「线上演示」为固定域名，并去掉「临时」标注

## 回滚

见 `docs/ROLLBACK.md`。数据库备份/恢复见 `docs/STABLE_DEPLOY.md`。
