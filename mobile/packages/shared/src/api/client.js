import Constants from 'expo-constants';
import { getToken } from '../auth/storage';

const API_BASE = Constants.expoConfig?.extra?.API_BASE || 'https://payulot.com';

export async function api(path, opts = {}) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

export const endpoints = {
  login: (email, password) =>
    api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => api('/api/me'),
  p2pTransfer: (payload) =>
    api('/api/transfers/p2p', { method: 'POST', body: JSON.stringify(payload) }),
  transactionsMe: () => api('/api/transactions/mine'),
};
