import Constants from 'expo-constants';

// Change this to your production host when ready:
const DEFAULT_BASE_URL = 'https://payulot.com';

const BASE_URL =
  (Constants.expoConfig?.extra?.API_BASE_URL) ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  DEFAULT_BASE_URL;

export async function apiFetch(path, { method = 'GET', headers = {}, body, token } = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export { BASE_URL };
