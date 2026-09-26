# UI 待测（SALES-FOLLOWUP-20260926-DEMO）

> 继承 P0P1：`product_green=NO` 直至 Windows 普通输密登录真测通过。Bot smoke / API PASS ≠ 产品全绿。

## 必须人工验证

1. **普通输密登录**（禁止 token 注入）— 见 P0P1 `UI-PENDING.md`
2. **导航可达**：顶部 AppNav 含 工作台 / 老板三屏 / 公海 / 外呼 / 话术 / 导入 / 企微侧栏 / 漏斗（经理）
3. **三套演示数据可见**：
   - 电销：公海列表 + `/dial` 任务包 + `/scripts`【电销】话术
   - B2B：工作台「今日待办」有逾期/到期
   - 成交：老板屏3 有逾期回款（非空态）
4. MOCK 标签在外呼与企微侧栏可见

## 不在本轮宣称

- REAL 企微 / REAL 外呼
- product_green=YES
