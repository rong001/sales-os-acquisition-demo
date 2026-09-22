export type ProductDef = {
  code: string;
  name_zh: string;
  name_en: string;
  tagline: string;
  amount_hint: string;
  cancel_policy: string;
  commitment_boundary: string;
  skill: string;
  /** 现网演示首页（HTTPS） */
  demo_live_url?: string;
  /** 现网 intake / 对话入口 */
  intake_url?: string;
  /** 公开仓 */
  repo_url?: string;
  /** 能力短列表（诚实边界） */
  capabilities?: string[];
};

export const PRODUCTS: Record<string, ProductDef> = {
  'ticket-grab': {
    code: 'ticket-grab',
    name_zh: '抢票助手',
    name_en: 'Ticket Grab',
    tagline: '高峰出行预约咨询 · 自愿留资',
    amount_hint: '咨询免费；正式服务费用以确认单为准，不含效果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成抢票成功率或价格承诺；成单需另行确认',
    skill: 'ticket-grab',
    demo_live_url: 'https://159.75.71.192:18444/',
    intake_url: 'https://159.75.71.192:18444/intake',
    repo_url: 'https://github.com/rong001/ticket-grab-cloud-demo',
    capabilities: [
      '查票 live',
      '盯票',
      '官方支付跳转协助',
      '非未授权代购、非无人值守自动下单',
    ],
  },
  usgate: {
    code: 'usgate',
    name_zh: 'USGate',
    name_en: 'USGate',
    tagline: '跨境合规咨询入口 · 自愿留资',
    amount_hint: '首次咨询免费；正式方案报价另行确认，不含结果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成签证/合规结果或价格承诺；成单需另行确认',
    skill: 'usgate',
    demo_live_url: 'https://117.55.227.224:8443/',
    intake_url: 'https://117.55.227.224:8443/',
    repo_url: 'https://github.com/rong001/usgate-demo',
    capabilities: [
      'MOCK 门户公网可开',
      '隧道/重连/流量已测（演示）',
      '不连真 3X-UI；真实面板/订阅未交付',
    ],
  },
};

export function getProduct(code?: string | null): ProductDef {
  if (code && PRODUCTS[code]) return PRODUCTS[code];
  return PRODUCTS['ticket-grab'];
}
