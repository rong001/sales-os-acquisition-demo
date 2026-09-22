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
    throw new Error(Array.isArray(msg) ? msg.join('; ') : msg);
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
};

export const LeadApi = {
  intake: (body) => api('/leads/intake', { method: 'POST', body: JSON.stringify(body) }),
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
  getCase: (id) => api(`/leads/${id}`),
  today: () => api('/workbench/today'),
  addActivity: (id, body) =>
    api(`/leads/${id}/activities`, { method: 'POST', body: JSON.stringify(body) }),
  listActivities: (id) => api(`/leads/${id}/activities`),
  listAgents: () => api('/agents'),
  funnel: (product) => api(`/admin/funnel${product ? `?product=${encodeURIComponent(product)}` : ''}`),
  exportCsvUrl: () => `${BASE}/admin/leads/export.csv`,
};
