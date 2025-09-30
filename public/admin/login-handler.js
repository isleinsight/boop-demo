<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const statusEl = document.getElementById('loginStatus');
  const submitBtn = document.querySelector('#loginForm button[type="submit"]');

  const setStatus = (msg, isErr = false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? 'red' : '#16a34a';
  };

  try {
    submitBtn && (submitBtn.disabled = true);
    setStatus('Signing in…');

    // ✅ Use API route, not /auth/login
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    let data = {};
    try { data = await res.json(); } catch { /* non-JSON fallback */ }

    if (!res.ok) {
      setStatus(data?.message || 'Login failed.', true);
      submitBtn && (submitBtn.disabled = false);
      return;
    }

    const { token, user } = data || {};
    if (!token || !user) {
      setStatus('Invalid response from server.', true);
      submitBtn && (submitBtn.disabled = false);
      return;
    }

    // Allow only super_admin, admin, support
    if (!['super_admin', 'admin', 'support'].includes(String(user.type || '').toLowerCase())) {
      setStatus('Access denied. This login is for authorized Admins only.', true);
      submitBtn && (submitBtn.disabled = false);
      return;
    }

    // Save session data locally
    localStorage.setItem('admin_id', user.id);
    localStorage.setItem('boop_jwt', token);
    localStorage.setItem('boopUser', JSON.stringify(user));

    // Decode JWT expiration
    function decodeJWT(t) {
      try { return JSON.parse(atob(t.split('.')[1])); } catch { return {}; }
    }
    const decoded = decodeJWT(token);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null;

    // Save session to DB (auth header required)
    try {
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: user.email,
          user_id: user.id,
          jwt_token: token,
          expires_at: expiresAt,
          status: 'online'
        })
      });
      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({}));
        console.warn('Session insert failed:', err?.message || sessionRes.status);
      }
    } catch (err) {
      console.warn('Admin session record error:', err?.message || err);
    }

    setStatus('Success! Redirecting…');
    // Redirect to admin dashboard/home
    window.location.href = 'index.html';

  } catch (err) {
    console.error('Login JS error:', err);
    setStatus('Network error: ' + err.message, true);
    submitBtn && (submitBtn.disabled = false);
  }
});
</script>
