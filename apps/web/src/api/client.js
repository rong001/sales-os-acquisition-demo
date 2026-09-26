const BASE = import.meta.env.VITE_API_BASE || '/api';

function token() {
  return localStorage.getItem('salesos_token') || '';
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || '请求失败';
    const err = new Error(Array.isArray(msg) ? msg.join('; ') : msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const AuthApi = {
  login: (email, password) =>
    api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => api('/auth/me'),
};

export const PublicApi = {
  products: () => api('/public/products'),
  product: (code) => api(`/public/products/${code}`),
  intake: (body) => api('/public/leads/intake', { method: 'POST', body: JSON.stringify(body) }),
  pages: () => api('/public/pages'),
  page: (slug) => api(`/public/pages/${encodeURIComponent(slug)}`),
  resolveRedirect: (code) => api(`/public/r/${encodeURIComponent(code)}`),
};

export const LeadApi = {
  intake: (body) => api('/leads/intake', { method: 'POST', body: JSON.stringify(body) }),
  importAuthorizedPublicList: (body) =>
    api('/leads/import/authorized-public-list', { method: 'POST', body: JSON.stringify(body) }),
  importCsv: (body) => api('/import/csv', { method: 'POST', body: JSON.stringify(body) }),
  csvTemplateUrl: () => `${BASE}/import/csv/template`,
  qualify: (id) => api(`/leads/${id}/qualify`, { method: 'POST', body: '{}' }),
  assign: (id, agent_seat_id) =>
    api(`/leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ agent_seat_id }) }),
  createAttempt: (id, channel = 'mock_call') =>
    api(`/leads/${id}/reach-attempts`, { method: 'POST', body: JSON.stringify({ channel }) }),
  mockReceipt: (attemptId, result_code = 'connected_intent') =>
    api(`/reach-attempts/${attemptId}/mock-receipt`, {
      method: 'POST',
      body: JSON.stringify({ result_code }),
    }),
  draftAppt: (id) => api(`/leads/${id}/appointments/draft`, { method: 'POST', body: '{}' }),
  confirmAppt: (id) => api(`/appointments/${id}/confirm`, { method: 'POST', body: '{}' }),
  markResult: (id, result, note) =>
    api(`/leads/${id}/mark-result`, { method: 'POST', body: JSON.stringify({ result, note }) }),
  getCase: (id) => api(`/leads/${id}`),
  today: () => api('/workbench/today'),
  dueFollowUps: () => api('/workbench/due-follow-ups'),
  handleFollowUp: (id) =>
    api(`/leads/${id}/follow-up/handle`, { method: 'POST', body: '{}' }),
  addActivity: (id, body) =>
    api(`/leads/${id}/activities`, { method: 'POST', body: JSON.stringify(body) }),
  listActivities: (id) => api(`/leads/${id}/activities`),
  listAgents: () => api('/agents'),
  funnel: (product) => api(`/admin/funnel${product ? `?product=${encodeURIComponent(product)}` : ''}`),
  conversion: () => api('/admin/conversion'),
  audits: (limit = 100) => api(`/admin/audits?limit=${limit}`),
  channelLinks: () => api('/admin/channel-links'),
  inviteCodes: () => api('/admin/invite-codes'),
  campaigns: () => api('/admin/campaigns'),
  contentPages: () => api('/admin/content-pages'),
  exportCsvUrl: () => `${BASE}/admin/leads/export.csv`,
};

export const PoolApi = {
  rules: () => api('/pool/rules'),
  putRules: (body) => api('/pool/rules', { method: 'PUT', body: JSON.stringify(body) }),
  publicList: (limit = 50) => api(`/pool/public?limit=${limit}`),
  claim: (caseId) => api(`/pool/${caseId}/claim`, { method: 'POST', body: '{}' }),
  release: (caseId, reason) =>
    api(`/pool/${caseId}/release`, { method: 'POST', body: JSON.stringify({ reason }) }),
  audits: (limit = 50) => api(`/pool/audits?limit=${limit}`),
  recycle: () => api('/pool/recycle', { method: 'POST', body: '{}' }),
};

export const BossApi = {
  screens: () => api('/boss/screens'),
};

export const FinanceApi = {
  listContracts: (caseId) => api(`/contracts?case_id=${encodeURIComponent(caseId)}`),
  createContract: (body) => api('/contracts', { method: 'POST', body: JSON.stringify(body) }),
  updateContract: (id, body) => api(`/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  listPlans: (caseId) => api(`/payment-plans?case_id=${encodeURIComponent(caseId)}`),
  createPlan: (body) => api('/payment-plans', { method: 'POST', body: JSON.stringify(body) }),
  listReceipts: (caseId) => api(`/payment-receipts?case_id=${encodeURIComponent(caseId)}`),
  createReceipt: (body) => api('/payment-receipts', { method: 'POST', body: JSON.stringify(body) }),
};

export const DialApi = {
  listTasks: () => api('/dial-tasks'),
  createTask: (body) => api('/dial-tasks', { method: 'POST', body: JSON.stringify(body) }),
  getTask: (id) => api(`/dial-tasks/${id}`),
  next: (id) => api(`/dial-tasks/${id}/next`, { method: 'POST', body: '{}' }),
  result: (itemId, body) =>
    api(`/dial-items/${itemId}/result`, { method: 'POST', body: JSON.stringify(body) }),
  startCall: (body) => api('/calls/start', { method: 'POST', body: JSON.stringify(body) }),
  listCalls: (caseId) => api(`/calls?case_id=${encodeURIComponent(caseId)}`),
  star: (id, body) => api(`/calls/${id}/star`, { method: 'POST', body: JSON.stringify(body || {}) }),
  starred: () => api('/calls/starred'),
  provider: () => api('/calls/provider'),
};

export const ScriptsApi = {
  list: (scene) => api(`/scripts${scene ? `?scene=${encodeURIComponent(scene)}` : ''}`),
  listAll: () => api('/scripts?all=1'),
  create: (body) => api('/scripts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/scripts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/scripts/${id}`, { method: 'DELETE' }),
  recommend: (caseId) => api(`/scripts/recommend/${caseId}`),
};

export const WecomApi = {
  status: () => api('/wecom/status'),
  context: (q) => {
    const params = new URLSearchParams();
    Object.entries(q || {}).forEach(([k, v]) => { if (v != null && v !== '') params.set(k, v); });
    return api(`/wecom/sidepanel/context?${params}`);
  },
  followUp: (body) => api('/wecom/sidepanel/follow-up', { method: 'POST', body: JSON.stringify(body) }),
  tag: (body) => api('/wecom/sidepanel/tag', { method: 'POST', body: JSON.stringify(body) }),
};
