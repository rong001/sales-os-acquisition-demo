# 浏览器级留资同意与来源追踪证据

> 合成数据；手机号已打码；无真实客户。公网为 **临时** trycloudflare（以 `../PUBLIC_URL.txt` 为准）。

## 环境

- 公网：`https://cons-make-empire-treaty.trycloudflare.com`（核验时存活）
- URL 参数：`utm_source=browser_e2e&utm_medium=shot&utm_campaign=toc&invite=INVSHOT1`
- 工具：`scripts/browser-e2e-shots.mjs`（puppeteer-core + google-chrome）

## 截图清单

| 文件 | 说明 |
|---|---|
| `ticket-grab-01-consent-unchecked.png` | 同意未勾；邀请码预填 INVSHOT1；UTM 条可见；现网 intake / 公开仓引导卡 |
| `ticket-grab-02-utm-invite-visible.png` | 表单已填合成数据；同意仍未勾；提交按钮禁用 |
| `ticket-grab-03-consent-checked.png` | 同意已勾 |
| `ticket-grab-04-submitted.png` | 提交成功（案件号前缀） |
| `usgate-01` … `usgate-04` | USGate 同流程（含 MOCK 门户引导） |

## API 证据

- `case-source-redacted.json`：案件 `8b5f5e1b-6940-401a-b96e-f333f9601ccd`，含 `utm_*`、`invite_code=INVSHOT1`、`consent_version=v1.0-2026`；手机 `138****8001`。

## 脱敏说明

- 姓名为「截图测试用户」；手机为连号合成号并在 JSON 中打码。
- 不收录真实客户、密码、完整未脱敏手机。
