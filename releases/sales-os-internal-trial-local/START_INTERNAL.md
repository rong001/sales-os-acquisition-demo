# 销售获客 OS · 内部本地启动包（持有人自用）

**主交付：本目录 / 同级 `sales-os-internal-trial-local.tar.gz`。请在你自己的电脑上启动。**  
Bot 机器上的 `http://127.0.0.1:18180` **不能**当作你的试用入口。

## 依赖

- Node.js 20+
- PostgreSQL
- Redis

## 步骤（最短）

```bash
cd sales-os-app
cp .env.example .env          # 由持有人本地填写密码/连接串；勿提交 .env
npm ci                       # 或 npm install
npm run build                # 若包内已有 apps/*/dist 可先跳过，异常时再 build
bash scripts/supervise.sh restart
```

启动后在本机浏览器打开：

```text
http://127.0.0.1:18180
```

（这是**你自己电脑**上的地址。）

演示账号见 `.env.example` 中的 `DEMO_*`（`agent@demo.local` / `manager@demo.local` 等）；密码只存在你本地的 `.env`。

## 临时演示（非稳定、非用户本机）

跑本交付时仍可访问（HTTP 200），**仅二次参考**：

`https://cons-make-empire-treaty.trycloudflare.com`

不稳定、随时可能失效；**不是**用户本机入口。未新建 tunnel / 未购买服务。主路径永远是本启动包。

## 不含内容

- 不含 `.env`、真实密码、真实客户数据
- 不含 `node_modules`（需本地 `npm ci` / `npm install`）
- 未新建 Cloudflare Named Tunnel / 付费服务
