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

/**
 * Primary enterprise AI sales product lines (获客 / Sales OS).
 * Legacy ticket-grab / usgate remain as optional demo landing channels only.
 */
export const PRODUCTS: Record<string, ProductDef> = {
  'ai-cs': {
    code: 'ai-cs',
    name_zh: 'AI客服',
    name_en: 'AI Customer Service',
    tagline: '企业 AI 客服定制 · B2B 获客与实施咨询',
    amount_hint: '咨询免费；正式实施费用以确认单为准，不含效果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成交付效果或价格承诺；成单需另行确认',
    skill: 'ai-cs',
    status_label: '企业获客主线 · 演示可用',
    service_disclaimer:
      '本入口用于企业 AI 客服获客与跟进演示，不等于正式服务合同或可售承诺。',
    capabilities: [
      '多渠道客服应答编排（演示）',
      '知识库检索与转人工策略（演示）',
      '会话质检与会话摘要（演示）',
    ],
    honesty: [
      '不虚称已对接具体客户生产环境',
      '不发明未授权外呼/私信触达',
      '正式交付范围以书面确认单为准',
    ],
  },
  'kb-crm': {
    code: 'kb-crm',
    name_zh: '知识库/CRM流程自动化',
    name_en: 'KB / CRM Automation',
    tagline: '知识库与 CRM 流程自动化 · 企业销售作业流',
    amount_hint: '咨询免费；正式实施费用以确认单为准，不含效果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成交付效果或价格承诺；成单需另行确认',
    skill: 'kb-crm',
    status_label: '企业获客主线 · 演示可用',
    service_disclaimer:
      '本入口用于知识库/CRM 流程自动化获客演示，不等于正式服务合同。',
    capabilities: [
      '知识库结构化与检索（演示）',
      'CRM 阶段流转与跟进提醒（本系统）',
      '线索归一与去重（本系统）',
    ],
    honesty: [
      '演示赢单 ≠ 客户成交',
      '公开来源导入的联系人/同意未知时存 UNKNOWN，不发明',
      '正式集成范围以书面确认为准',
    ],
  },
  'sales-agent': {
    code: 'sales-agent',
    name_zh: '销售智能体',
    name_en: 'Sales Agent',
    tagline: '销售智能体实施 · 获客到跟进作业流',
    amount_hint: '咨询免费；正式实施费用以确认单为准，不含效果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成交付效果或价格承诺；成单需另行确认',
    skill: 'sales-agent',
    status_label: '企业获客主线 · 演示可用',
    service_disclaimer:
      '本入口用于销售智能体实施获客演示，不等于正式服务合同或可售承诺。',
    capabilities: [
      '线索导入与归属隔离（本系统）',
      '到期跟进站内待办（列表轮询，非 worker 推送）',
      '经理漏斗与只读写分离（本系统）',
    ],
    honesty: [
      '到期提醒机制为 workbench 列表轮询/查询，不虚称 worker 定时推送',
      '合成夹具与公开来源记录硬分离',
      '不外发邮件/电话/私信/代购',
    ],
  },
  // Legacy demo landing channels (optional; not primary enterprise chrome)
  'ticket-grab': {
    code: 'ticket-grab',
    name_zh: '抢票助手（演示渠道）',
    name_en: 'Ticket Grab (legacy demo)',
    tagline: '高峰出行预约咨询 · 自愿留资（演示渠道，非企业获客主线）',
    amount_hint: '咨询免费；正式服务费用以确认单为准，不含效果承诺',
    cancel_policy: '预约开始前 2 小时可取消；临近 2 小时取消记入爽约统计',
    commitment_boundary: '本预约不构成抢票成功率或价格承诺；成单需另行确认',
    skill: 'ticket-grab',
    demo_live_url: 'https://159.75.71.192:18444/',
    intake_url: 'https://159.75.71.192:18444/intake',
    capabilities_url: 'https://159.75.71.192:18444/capabilities',
    repo_url: 'https://github.com/rong001/ticket-grab-cloud-demo',
    repo_tip: '9ee80b0',
    status_label: '可选演示渠道 · 非企业获客主线',
    service_disclaimer:
      '本页为历史演示留资入口，不等于企业 AI 定制主线，也不等于正式服务合同。',
    capabilities: [
      '火车公开余票查询 live（provider=train12306；trainRealSubmit=false）',
      '现网 /tokenize · /capabilities 可访问',
      '非未授权代购；真实成交/自动购票仍 stub',
    ],
    honesty: [
      '机票实时可售/票价监控不可用',
      '邮件通知未实达（待 SMTP）',
      '不虚称自动购票',
    ],
  },
  usgate: {
    code: 'usgate',
    name_zh: 'USGate（演示渠道）',
    name_en: 'USGate (legacy demo)',
    tagline: '跨境合规咨询入口 · 自愿留资（MOCK 演示渠道，非企业获客主线）',
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
    status_label: '可选演示渠道 · 非企业获客主线',
    service_disclaimer:
      '本页为历史 MOCK 演示留资入口，不等于企业 AI 定制主线。',
    capabilities: [
      'MOCK 门户公网可开（Let’s Encrypt IP；mock_xui:true）',
      'demo@809bf29 · client@53a9afb 脱敏源码已公开',
    ],
    honesty: [
      '未接真实 3X-UI；Android 真机 E2E 未通过',
      '不可标 ToC 真实可用/可售',
    ],
  },
};

export function getProduct(code?: string | null): ProductDef {
  if (code && PRODUCTS[code]) return PRODUCTS[code];
  return PRODUCTS['sales-agent'];
}

/** Primary enterprise product codes (not legacy landing demos). */
export const ENTERPRISE_PRODUCT_CODES = ['ai-cs', 'kb-crm', 'sales-agent'] as const;
