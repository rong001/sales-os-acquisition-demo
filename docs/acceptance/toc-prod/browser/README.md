# 浏览器级留资同意与来源追踪证据（toc-prod）

> **合成数据**；手机号已打码；无真实客户。公网为 **临时** trycloudflare（以 `../PUBLIC_URL.txt` 为准）。  
> 本目录截图**不能**单独证明「固定域名通过」或「整体独立端到端验收通过」。

## 环境

- 公网：见 `../PUBLIC_URL.txt`（核验时存活；重部署会变）
- URL 参数：`utm_source=selftest&utm_medium=manual&utm_campaign=retest&invite=SELFTEST1`
- 工具：puppeteer-core + google-chrome-stable（与 `scripts/browser-e2e-shots.mjs` 同类）

## 截图清单

| 文件 | 说明 |
|---|---|
| `ticket-grab-01-consent-unchecked.png` | 同意未勾；邀请码预填 SELFTEST1；UTM 条可见 |
| `ticket-grab-02-utm-invite-visible.png` | 表单已填合成数据；同意仍未勾 |
| `ticket-grab-03-consent-checked.png` | 同意已勾 |
| `ticket-grab-04-submitted.png` | 提交成功（案件号前缀） |
| `usgate-01` … `usgate-04` | USGate 同流程 |

## API 证据

- `case-source-redacted.json`：案件 `edcbc252-e3ed-49e3-939a-3a03cf896d6d`，含 `utm_*`、`invite_code=SELFTEST1`、`consent_version=v1.0-2026`；手机 `138****9911`。
- `shot-meta.json`：短号与时间戳。

## 脱敏说明

- 姓名为「自助复测用户」；手机为合成号并在 JSON 中打码。
- 不收录真实客户、密码、完整未脱敏手机。

## 自助复测

见 [`../SELF_RETEST.md`](../SELF_RETEST.md)。
