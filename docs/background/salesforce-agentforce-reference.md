# Salesforce / Agentforce 行业参考（CRM/销售软件）

> **访问日期**：2026-09-23  
> **用途**：CRM / 销售软件头部产品的**公开表述与产品概念**摘录，供获客 Agent / Sales OS 作行业对照。  
> **非客户声明**：本文**仅作参考**；Salesforce **不是**本产品客户；**不得**表述为「全球最大销售外包公司」或类似说法。

---

## 免责声明（必读）

- **仅作 CRM / 销售软件头部参考**，不是本仓库产品的客户案例，也不是合作背书。
- **不是销售外包公司**相关表述；公开材料描述的是 CRM 平台与 Agentforce（AI agent）产品能力。
- 文中数字与功能描述均来自下方所列**公开 URL**；**未**臆造市场份额或客户意图。
- 未抓取任何私有 org、登录态或非公开数据；Help 页若为 SPA 壳页导致正文未返回，已在文中标明，并改引同主题的官方公开文档。

---

## 1. Salesforce 公开市场主张（IDC）

来源：[Salesforce Ranked #1 CRM Provider for 13th Consecutive Year](https://www.salesforce.com/news/stories/idc-crm-market-share-ranking-2026/)（访问 2026-09-23；文内日期 2026-06-04）

公开声称摘要（ paraphrased / 可核对原文）：

- IDC *Worldwide Semiannual Software Tracker*（文内标注 April 2026）将 Salesforce 评为 CRM **#1**，并称此为**连续第 13 年**。
- 文内写明：按 IDC，**2025 年** Salesforce 在 CRM 厂商中份额为 **20.0%**。
- 文内还称：Sales 连续第 14 年 #1、Customer Service 连续第 13 年 #1、Marketing 连续第 7 年 #1 等（同为 Salesforce 新闻稿对 IDC 的转述）。
- 另称 IDC 首次公布 Agent Build and Deploy 份额；Salesforce 该品类 **#2**、份额 **17.5%**（脚注：*IDC Semiannual Core AI Software Tracker, H2 2025*）。

脚注定义（新闻稿）：CRM 市场含 IDC 定义的 Sales Force Productivity and Management、Marketing Campaign Management、Customer Service、Contact Center、Advertising、Digital Commerce Applications 等。

**引用注意**：以上均为 Salesforce 新闻页对 IDC 的公开转述；独立复算需对照 IDC 原报告。本文**不**另造数字。

---

## 2. Agentforce 用于 salesforce.com：接待 → 资格澄清 → SDR

来源：[Agentforce is reinventing how visitors navigate Salesforce’s websites](https://www.salesforce.com/customer-stories/agentforce-for-dot-com/)（访问 2026-09-23；文内日期 2025-05-30）

故事描述（高阶流程，非实现细节）：

1. **站点接待 / 答疑**：访客用自然语言提问（产品差异、定价等）；Agentforce 结合内容检索给出回答，替代仅靠菜单/搜索与脚本 chatbot。
2. **情境与线索质量**：可按访客自述（如小企业、零售等）调整回答；定价相关路径可引导留资，并在 Sales Cloud 中形成可跟进机会。
3. **转人工 SDR**：若访客要直接与人沟通，Agentforce 可将对话及摘要**实时转给销售开发代表（SDR）**；文内对比旧 chatbot 把产品/定价问题一律转 SDR，称新方案可减少 SDR 在未充分资格线索上的时间。
4. **文内结果指标（Salesforce 自述，非本仓库验证）**：如资格相关时长同比降低约 40%、自发布起大量会话与受影响线索、Agentforce 线索相对站点均值更高转化等——仅作故事引用，**不作本产品承诺**。

产品标签（故事页）：Agentforce、Data 360、Sales Cloud。

---

## 3. 销售 Agent 配置概念：ICP / 必填或捕获字段 / 资格问题

### 3.1 指定 Help 页抓取说明

目标 URL：[Set up Agentforce（Sales Agent）Help](https://help.salesforce.com/s/articleView?id=sales.sales_agent_set_up_agentforce.htm&language=en_US&type=5)（访问 2026-09-23）

- WebFetch 与 `curl` 均仅得到 Help **SPA 壳页**（标题 “Salesforce Help”，正文未静态渲染）。
- **因此下文不声称已逐字引用该 article 正文**；概念改自同主题的 **Salesforce 官方公开** Trailhead / 博客 / 实施指南，用于说明行业常见配置维度（ICP 画像、需捕获字段、资格问询 → 人工交接）。

### 3.2 公开材料中的高阶概念（无私有数据）

| 概念 | 公开材料中的含义（概括） | 来源 |
|------|--------------------------|------|
| **客户画像 / ICP 类配置** | 在资格设置中描述目标客户与意向信号（Trailhead 示例：聚焦金融服务业、已表现购买意向如 demo/询价）；评估兴趣并优先高潜客户。 | [Trailhead：Configure and Activate Your Lead Nurturing Agent](https://trailhead.salesforce.com/content/learn/modules/agentforce-sdr-setup-and-customization/configure-and-activate-your-sdr-agent)（访问 2026-09-23） |
| **需捕获 / 补充字段** | 「Additional Data to Capture」一类配置：指定要从互动中补齐的 Lead 字段（Trailhead 示例选 Industry、Rating）；用于后续分派与优先级，而非抓取外部私有数据。 | 同上 Trailhead |
| **分派条件** | 按字段条件自动把符合条件的线索分给 agent（Trailhead 示例：Industry=Finance 且 Rating 为 Warm/Hot 等逻辑）。 | 同上；实施指南亦强调 assignment criteria（[Agentforce Sales Implementation Guide](https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/guides/agentforce-sales-implementation-guide.pdf)，访问 2026-09-23） |
| **资格问题 → 人工** | 资格代理可按框架（公开博客示例为 **BANT**：Budget / Authority / Need / Timeline）多轮提问；达标后触发分派/排队给销售代表；不达标则更新 CRM 状态。 | [Autonomous Lead Qualification with Agentforce Script](https://www.salesforce.com/blog/autonomous-lead-qualification-agentforce/)（访问 2026-09-23） |

**原则**：上述仅为产品配置与公开案例中的**概念层**描述；具体字段清单、阈值与话术由各 org 自定，**不可**当作本仓库对某客户的已知意图。

---

## 4. 业务假设（OUR assumption — 非 Salesforce 事实）

> 以下为本获客 / Sales OS 侧的**业务假设**，**不是** Salesforce 官方事实，也**不是**已验证的客户需求。

1. **我们卖什么**：企业销售向的 AI 定制——AI 客服、知识库 / CRM 流程自动化、销售 Agent 落地实施。
2. **初始 ICP（假设）**：B2B 公司；有真实可访问的对公网站与业务线索；存在客服或销售流程上的自动化/提效需求。
3. **未知项**：预算（Budget）、明确需求强度（Need）、采购时机（Timing）等，**除非有证据否则视为 UNKNOWN**——**禁止编造客户意图**。
4. **与本文关系**：Salesforce/Agentforce 仅作头部 CRM/销售软件能力对照；**不**将 Salesforce 列为我们的客户，**不**用其市场地位暗示我们已签约或已交付。

---

## 5. 来源一览（访问日期统一 2026-09-23）

| # | URL | 状态 |
|---|-----|------|
| 1 | https://www.salesforce.com/news/stories/idc-crm-market-share-ranking-2026/ | 已读取 |
| 2 | https://www.salesforce.com/customer-stories/agentforce-for-dot-com/ | 已读取 |
| 3 | https://help.salesforce.com/s/articleView?id=sales.sales_agent_set_up_agentforce.htm&language=en_US&type=5 | 静态抓取无正文（SPA）；概念改引 Trailhead / 官方博客 / 实施指南 |
| 补 | https://trailhead.salesforce.com/content/learn/modules/agentforce-sdr-setup-and-customization/configure-and-activate-your-sdr-agent | 已读取（资格设置 / Customer Profile / 捕获字段） |
| 补 | https://www.salesforce.com/blog/autonomous-lead-qualification-agentforce/ | 已读取（BANT 资格问询 → 分派） |
| 补 | https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/guides/agentforce-sales-implementation-guide.pdf | 已读取（分派条件等实施概念） |
