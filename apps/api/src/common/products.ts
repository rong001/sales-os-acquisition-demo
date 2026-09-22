export type ProductDef = {
  code: string;
  name_zh: string;
  name_en: string;
  tagline: string;
  amount_hint: string;
  cancel_policy: string;
  commitment_boundary: string;
  skill: string;
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
  },
};

export function getProduct(code?: string | null): ProductDef {
  if (code && PRODUCTS[code]) return PRODUCTS[code];
  return PRODUCTS['ticket-grab'];
}
