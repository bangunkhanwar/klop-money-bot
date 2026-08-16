import { demoApi } from './demo';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
const baseUrl = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const CSRF_STORAGE_KEY = 'klop-csrf';
let csrfToken = sessionStorage.getItem(CSRF_STORAGE_KEY) || '';

function saveCsrfToken(token) {
  csrfToken = String(token || '');
  if (csrfToken) sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
  else sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${baseUrl}/api/auth/csrf`, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Sesi keamanan tidak tersedia.');
  saveCsrfToken(data.csrfToken);
  return csrfToken;
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/api/auth/verify';
  if (needsCsrf) await ensureCsrfToken();
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(needsCsrf ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers
    },
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Permintaan gagal.');
    error.status = response.status;
    throw error;
  }
  if (data.csrfToken) saveCsrfToken(data.csrfToken);
  if (path === '/api/auth/logout') saveCsrfToken('');
  return data;
}

export const api = isDemoMode ? demoApi : {
  verifyLogin: (whatsappNumber, code) => request('/api/auth/verify', { method: 'POST', body: { whatsappNumber, code } }),
  getMe: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  getDashboard: (month) => request(`/api/dashboard?month=${encodeURIComponent(month)}`),
  getCategories: () => request('/api/categories'),
  getTransactions: (month) => request(`/api/transactions?month=${encodeURIComponent(month)}&limit=500`),
  getTransaction: (id) => request(`/api/transactions/${encodeURIComponent(id)}`),
  createTransaction: (body) => request('/api/transactions', { method: 'POST', body }),
  updateTransaction: (id, body) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteTransaction: (id) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getBudgets: (month) => request(`/api/budgets?month=${encodeURIComponent(month)}`),
  saveBudgets: (month, budgets) => request('/api/budgets', { method: 'PUT', body: { month, budgets } }),
  getAccount: () => request('/api/account'),
  updateAccount: (body) => request('/api/account', { method: 'PUT', body })
};
