# Sales OS PRD · P0+P1 完整落地（2026-09-26）

> 产品：销售公司定制 OS（B2B / 电销+在线获客）  
> 视角：AI 产品经理 + 中国销售一线用户  
> 技术原则：NestJS+Vue+PG+Redis 现栈延续；学 Twenty/Espo/Vben，不 fork 换栈；仅官方 API；MOCK/REAL 诚实  
> 范围：本文锁定 **P0+P1**；P2（提成、质检大模型、PaaS）不在本 PRD

---

## 1. 背景与目标

### 1.1 问题
中国销售公司日常在微信/企微里成交，却被迫在复杂 CRM 二次录入；公海规则不透明导致抢单与囤单；跟进不写下次时间；老板看不到手机三屏；成交后无合同回款；电销无任务包与话术沉淀。

### 1.2 产品目标（本迭代）
把现有 LeadCase 试用栈升级为**可日常使用的销售公司 OS 最小完整面**：

| 目标 | 可观测成功标准 |
|------|----------------|
| 公海政治可执行 | 可配上限/保护期/回收；销售可见规则；有审计 |
| 跟进可养成习惯 | 无下次跟进时间不可保存；今日待办按时间排序 |
| 老板可决策 | 三屏：今日待办 / 团队漏斗 / 回款风险 |
| 导入不痛苦 | 模板、失败行导出、来源必填、合并可读 |
| 企微减二次录入 | 官方侧边栏可打开案件、写跟进、打标签（沙箱/配置态） |
| 成交可财务 | 合同最小对象 + 回款计划/实收 |
| 电销可排班 | 外呼任务包 + 通话 MOCK→REAL 开关 + 录音挂案 |
| 知识可沉淀 | 话术库 CRUD + 优秀录音标星 |
| 视觉克制 | 坐席工作台与案件详情符合克制规范；渐进披露 |
| 诚实验收 | UI 输密可测；`product_green` 仅在 UI 真测后为 YES |

### 1.3 非目标
- 不自建外呼线路 / 不非法逆向企微  
- 不替代财务 ERP 全量；只做销售侧最小回款  
- 不动 Sub2API 端口与数据  
- 不把 ToC 落地页演示当成内部 OS Done  

---

## 2. 用户与场景

| 角色 | 核心场景 | 系统入口 |
|------|----------|----------|
| 老板/销总 | 早上看三屏；催逾期回款；看团队漏斗 | 老板三屏（移动优先布局） |
| 销售经理 | 建公海规则；建外呼任务包；看完成率 | 管理/任务/公海设置 |
| 销售员 | 领公海；跟进必写下次；看自己待办 | 坐席工作台 |
| 电销坐席 | 领任务包号码；一键拨打；回写结果 | 外呼任务队列 |
| 市场 | Excel/公开源导入；看失败行 | 导入页 |
| 财务协作者 | 录实收、看计划 | 合同/回款（最小） |
| 管理员 | RBAC、MOCK/REAL 开关 | 设置 |

---

## 3. 竞品对照（决策摘要）

| 学谁 | 学什么 | 不学什么 |
|------|--------|----------|
| EC / 云客 | 公海+通话证据+任务包心智 | 自建线路 |
| 企微 SCRM | 侧边栏跟进 | 非官方抓取会话 |
| 纷享/销售易 | 线索→回款叙事 | PaaS 对象爆炸 |
| Twenty/Espo（开源） | 对象清晰、线索池 | 整仓替换 |
| Vben/Naive Admin | 布局与权限壳 | 花哨主题 |

---

## 4. 信息架构与页面

```
登录（普通输密）
├── 坐席工作台（默认）
│   ├── 今日待办（到期跟进）
│   ├── 我的案件
│   ├── 公海领取
│   └── 快捷导入入口
├── 案件详情
│   ├── 概况 / 来源诚实状态
│   ├── 极简跟进（强制下次时间）
│   ├── 活动时间轴
│   ├── 合同与回款
│   ├── 通话/录音
│   └── 话术推荐（侧栏）
├── 老板三屏
│   ├── 今日待办（团队）
│   ├── 团队漏斗
│   └── 回款风险
├── 外呼任务
├── 话术库
├── 公海规则（经理）
├── 导入中心
└── 企微侧边栏页（独立轻页，官方应用配置）
```

---

## 5. 功能规格

### P0-1 公海/私海规则引擎
- **字段/配置**：`max_private_cases`、`protect_hours`、`idle_days_to_recycle`、`enabled`
- **动作**：领取、回收（定时+手动）、转让（可选本迭代）
- **规则**：超上限不可领；保护期内不可被抢；超 idle 自动回公海并通知原归属
- **审计**：谁在何时领/回收；规则变更日志
- **验收**：经理改规则→销售可见；N 天无跟进案件进入公海；并发领取同案仅一人成功

### P0-2 极简跟进 + 强制下次时间
- 跟进表单 ≤3 控件：结果短选、备注、下次时间（必填）
- 无 `next_follow_at` → 400 + UI 阻断
- 工作台「今日待办」按 `next_follow_at` 升序
- **验收**：缺下次时间无法保存；写完出现在待办

### P0-3 老板三屏
- 屏1：团队今日到期/逾期跟进数 + 列表入口  
- 屏2：漏斗阶段计数（沿用现有 funnel，移动布局）  
- 屏3：回款风险（有合同未回 / 逾期计划；无数据时诚实空态）  
- **验收**：经理角色可打开；销售角色按 RBAC 受限或只看自己（产品默认：老板/经理看团队）

### P0-4 批量导入打磨
- 下载 CSV 模板；来源必填；失败行可导出；合并提示（`case_merged`）可读中文  
- **验收**：坏行不影响好行；报告含成功/失败/合并数

### P0-5 UI 克制重构
- 工作台、案件详情按 [sales-os-ui-restrained](sand-workflow:sales-os-ui-restrained)  
- 单一强调色；模块不堆满；高级字段折叠  
- **验收**：截图对照规范；关键 testid 保留

### P0-6 普通输密登录可测
- 登录页可用；验收脚本支持「真 UI」路径标记；未测则 `ui=SKIP`、`product_green=NO`  
- **验收**：文档写清 Windows 人工步骤；Bot 不虚称 UI PASS

### P1-1 企微侧边栏 MVP
- 独立轻页：`/wecom/sidepanel`；通过 corpId/agent 配置启用  
- 能力：按外部联系人/手机号解析 LeadCase；写跟进；打标签  
- 无凭证时展示配置引导 + MOCK 演示模式（诚实标签）  
- **验收**：无密钥时不崩溃；MOCK 可演示写跟进；REAL 需用户配置官方应用

### P1-2 合同最小对象
- `contracts`：case_id、amount、currency、status(draft/signed/void)、signed_at、attachment_url(可选)、note  
- 案件详情可创建/查看  
- **验收**：WON 可无合同（提示补建）；有合同可挂回款计划

### P1-3 回款计划 + 实收
- `payment_plans`：due_at、amount、status  
- `payment_receipts`：paid_at、amount、method  
- 老板第三屏聚合逾期  
- **验收**：录实收后风险列表更新；隔离租户/权限

### P1-4 外呼任务包
- 经理创建任务：名称、案件集合或筛选、截止日期  
- 坐席队列：领取下一条、回写结果（未接/接通/预约/拒绝）  
- 通话：`CALL_PROVIDER=mock|real`；MOCK 写假通话记录；REAL 预留官方供应商适配器接口  
- 录音 URL 挂 LeadCase 活动  
- **验收**：任务完成率统计；MOCK 全链路；REAL 无密钥时拒绝并提示

### P1-5 话术库 + 优秀录音
- 话术：场景、标题、正文、标签 CRUD  
- 录音活动可「标星优秀」并关联话术场景  
- 案件详情侧栏推荐  
- **验收**：CRUD + 标星列表

---

## 6. 数据模型（增量）

```
pool_rules (org级别配置)
pool_audit_logs
contracts
payment_plans
payment_receipts
dial_tasks / dial_task_items
call_records (case_id, provider, duration, recording_url, result, mock|real)
scripts (话术)
script_stars (optional link call_record ↔ script)
wecom_link_cache (optional)
```

LeadCase 增补：`sea_status` (private|public)、`protected_until`、`last_touch_at`（若尚无则用活动推导）

---

## 7. API 草图（新增）

- `GET/PUT /pool/rules`  
- `GET /pool/public` · `POST /pool/:caseId/claim` · `POST /pool/:caseId/release`  
- `GET /boss/screens`  
- `POST /import/csv`（增强报告）  
- `CRUD /contracts` · `/payment-plans` · `/payment-receipts`  
- `CRUD /dial-tasks` · `POST /dial-tasks/:id/next` · `POST /dial-items/:id/result`  
- `POST /calls/start` · webhook/callback stub  
- `CRUD /scripts` · `POST /calls/:id/star`  
- `GET /wecom/sidepanel/context` · `POST /wecom/sidepanel/follow-up`

---

## 8. 里程碑

| 里程碑 | 交付 | 验收 |
|--------|------|------|
| M1 | PRD + 3 skills（本文） | 文档在仓 |
| M2 | P0 API+UI | 公海/跟进/三屏/导入单测+业务断言 |
| M3 | P1 API+UI | 合同回款/任务包/话术/企微轻页 |
| M4 | 视觉打磨 + runner 扩展 | 截图+testid |
| M5 | 唯一包 followup-P0P1 | SHA256；Windows 叠包说明；product_green 诚实 |

---

## 9. 风险与诚实边界

- 企微/通话 REAL 依赖用户租户资质与官方应用——产品内必须可 MOCK 演示且标注。  
- 「完整上线」本迭代指：**功能在隔离栈可运行 + 文档可交付客户试用**；固定域名/公网生产仍待用户基础设施。  
- UI 输密未在用户机验证前，不得宣称产品全绿。

---

## 10. Skills 绑定

- [sales-os-cn-sop](sand-workflow:sales-os-cn-sop)  
- [sales-os-ui-restrained](sand-workflow:sales-os-ui-restrained)  
- [sales-os-acceptance](sand-workflow:sales-os-acceptance)  

---

## 11. 变更记录

- 2026-09-26：用户确认 **P0+P1 一起完整开发**；本 PRD 锁定范围。
