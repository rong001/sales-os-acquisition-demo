# UI 待测（SALES-FOLLOWUP-20260926-P0P1）

> 诚实边界：Bot/API harness **不等于** 产品全绿。`product_green=NO` 直至下列项在用户 Windows 机真测通过。

## 必须人工验证

1. **普通输密登录**（禁止 token 注入）
   - 打开 `http://127.0.0.1:<NATIVE_WEB_PORT>/login`
   - 用 `.env.native` 中 `manager@demo.local` / `agent@demo.local` / `agent2@demo.local` + 对应 `DEMO_*_PASSWORD` 键入登录
   - 错误密码应显示 UI 错误（`data-testid=login-error`），不得进入工作台
   - 退出后访问 `/` 应回到登录页

2. **坐席工作台**
   - `data-testid=due-follow-ups` 按下次跟进时间排序
   - 公海领取 `data-testid=public-sea-claim` / `pool-claim-btn`
   - 导航：老板三屏 / 公海 / 外呼 / 话术 / 导入

3. **案件详情极简跟进**
   - 无下次时间时 UI 阻断（`data-testid=follow-error`）且 API 400
   - 合同/回款面板、话术推荐、通话 MOCK 标星

4. **老板三屏** `/boss`
   - 屏3 无数据时诚实空态 `data-testid=payment-risk-empty`

5. **企微侧边栏** `/wecom/sidepanel`
   - 无密钥时 MOCK 标签可见；可解析案件并写跟进

6. **列表隔离**
   - sales1 / sales2 各自登录后案件列表互不可见（与 API isolation 对齐的 UI 可见性）

## 不在本轮宣称

- REAL 企微 / REAL 外呼（需用户租户官方密钥）
- 固定公网域名生产上线
