# 跨时点到期跟进（作战台自动刷新）— E2E

> 合成账号；密码仅从本地 `.env` 的 `DEMO_*` 读取。  
> 自动化：`npm run e2e:followup-live`（`scripts/e2e-followup-live-poll.sh` + `scripts/browser-followup-live-poll.mjs`）。  
> **禁止**把 `next_follow_at` 从未来改成过去当作「自动出现」证据——本套件只设定一次，等待墙上时钟越过后再断言。

## 证明点

1. sales1/manager 建案并分配 sales1，**仅一次**设定 `next_follow_at = now + ~30s`。
2. 真实浏览器（本机 Chrome / puppeteer-core）登录 sales1，停留在 `/` **不手动刷新**。
3. 到期前截图：该案不在「到期跟进」。
4. 墙上时钟 > `next_follow_at` + 一轮轮询后截图：该案出现（依赖 WorkbenchView 5s 轮询）。
5. 同期 sales2 作战台不见该项。
6. sales1 点「已处理」后，后续轮询不再出现。

## 产物

- `results.json`：`set_at` / `next_follow_at` / `before_shot_at` / `after_shot_at` / `handled_at`
- `browser/sales1-workbench-before-due.png` / `sales1-workbench-after-due.png` / `sales2-workbench-same-period.png` / `sales1-workbench-after-handled.png`
- `.raw/`：含 JWT，已 gitignore

## 浏览器路径

`/login` → `/`（今日作战台）→「到期跟进」→「已处理」
