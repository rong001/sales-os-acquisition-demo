export type ProductDef = {
  code: string;
  name_zh: string;
  name_en: string;
  tagline: string;
  amount_hint: string;
  cancel_policy: string;
  commitment_boundary: string;
  skill: string;
  demo_live_url?: string;
  intake_url?: string;
  capabilities_url?: string;
  repo_url?: string;
  repo_tip?: string;
  secondary_repos?: Array<{ name: string; url: string; tip?: string }>;
  capabilities?: string[];
  /** 诚实能力边界（落地页 / 矩阵） */
  honesty?: string[];
  /** 演示 vs 正式服务说明 */
  service_disclaimer?: string;
  status_label?: string;
};

export const PRODUCTS: Record<string, ProductDef> = {
  'ticket-grab': {
    code: 'ticket-grab',
    name_zh: '抢票助手',
    name_en: 'Ticket Grab',
    tagline: '高峰出行预约咨询 · 自愿留资（演示）',
    amount_hint: '咨询免费；正式服务费用以确认单为准，不含效果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成抢票成功率或价格承诺；成单需另行确认',
    skill: 'ticket-grab',
    demo_live_url: 'https://159.75.71.192:18444/',
    intake_url: 'https://159.75.71.192:18444/intake',
    capabilities_url: 'https://159.75.71.192:18444/capabilities',
    repo_url: 'https://github.com/rong001/ticket-grab-cloud-demo',
    repo_tip: '9ee80b0',
    status_label: '演示可用 · 不可标正式可售',
    service_disclaimer:
      '本页为「演示留资」入口，不等于正式服务合同或可售承诺。正式服务以书面确认单为准。',
    capabilities: [
      '火车公开余票查询 live（provider=train12306；trainRealSubmit=false）',
      '现网 /intake · /capabilities 可访问',
      '非未授权代购；真实成交/自动购票仍 stub',
    ],
    honesty: [
      '机票实时可售/票价监控不可用（flightInventoryLive=false / flightFareMonitor=false；OpenSky≠票源；未接合法库存/价格 API）',
      '邮件通知未实达（待 SMTP）：SMTP→127.0.0.1:587 ECONNREFUSED；NotificationEvent emailed=false — 属阻塞，非成功 MOCK',
      '产品端到端独立验收未通过；不虚称自动购票',
      '公开仓 tip 9ee80b0（历史基线曾引用 88f93f3）',
    ],
  },
  usgate: {
    code: 'usgate',
    name_zh: 'USGate',
    name_en: 'USGate',
    tagline: '跨境合规咨询入口 · 自愿留资（MOCK 演示）',
    amount_hint: '首次咨询免费；正式方案报价另行确认，不含结果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成签证/合规结果或价格承诺；成单需另行确认',
    skill: 'usgate',
    demo_live_url: 'https://117.55.227.224:8443/',
    intake_url: 'https://117.55.227.224:8443/',
    repo_url: 'https://github.com/rong001/usgate-demo',
    repo_tip: '809bf29',
    secondary_repos: [
      { name: 'usgate-client', url: 'https://github.com/rong001/usgate-client', tip: '53a9afb' },
    ],
    status_label: 'MOCK 演示+脱敏源码 · 不可标 ToC 真实可用/可售',
    service_disclaimer:
      '本页为「演示留资」入口，不等于正式服务合同。USGate 现网仅为 MOCK 门户（mock_xui:true），非真面板/真机验收。',
    capabilities: [
      'MOCK 门户公网可开（Let’s Encrypt IP；mock_xui:true）',
      'demo@809bf29 · client@53a9afb 脱敏源码已公开',
    ],
    honesty: [
      '未接真实 3X-UI；Android 真机 E2E 未通过',
      '未交付：真面板验收、真订阅、真机出口证据、GH Actions CI workflow 上线',
      '不可标 ToC 真实可用/可售',
    ],
  },
};

export function getProduct(code?: string | null): ProductDef {
  if (code && PRODUCTS[code]) return PRODUCTS[code];
  return PRODUCTS['ticket-grab'];
}
