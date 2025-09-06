
async function apiFetch(url, opts = {}) {
  const token = localStorage.getItem('boop_jwt');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });

  const renewed = res.headers.get('x-renew-jwt');
  if (renewed) localStorage.setItem('boop_jwt', renewed);

  return res;
}


async function apiJSON(url, opts = {}) {
  const res = await apiFetch(url, opts);
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}
function apiGet(url){ return apiJSON(url); }
function apiPost(url, body){ return apiJSON(url, { method:'POST', body: JSON.stringify(body||{}) }); }
function apiPatch(url, body){ return apiJSON(url, { method:'PATCH', body: JSON.stringify(body||{}) }); }
function apiDelete(url, body){ return apiJSON(url, { method:'DELETE', body: JSON.stringify(body||{}) }); }

