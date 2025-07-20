document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const statusEl = document.getElementById('loginStatus');

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      statusEl.style.color = 'red';
      statusEl.textContent = data.message || 'Login failed.';
      return;
    }

    const { token, user } = data;

    // ✅ Save session data locally
    localStorage.setItem("admin_id", user.id);
    localStorage.setItem("boop_jwt", token);
    localStorage.setItem("boopUser", JSON.stringify(user));

    // 🔓 Decode JWT expiration
    function decodeJWT(token) {
      const payload = token.split('.')[1];
      const decoded = atob(payload);
      return JSON.parse(decoded);
    }

    const decoded = decodeJWT(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();

    // 💾 Save session to DB (with Authorization header)
    try {
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // 🔐 Crucial for middleware
        },
        body: JSON.stringify({
          email: user.email,
          user_id: user.id,
          jwt_token: token,
          expires_at: expiresAt,
          status: "online"
        })
      });

      if (!sessionRes.ok) {
        const err = await sessionRes.json();
        console.warn("⚠️ Session insert failed:", err.message);
      } else {
        console.log("📬 Admin session successfully recorded.");
      }

    } catch (err) {
      console.error("❌ Admin session record error:", err.message);
    }

    // 🔁 Redirect to dashboard
    window.location.href = 'index.html';

  } catch (err) {
    statusEl.style.color = 'red';
    statusEl.textContent = 'Network error: ' + err.message;
    console.error("🔥 Login JS error:", err);
  }
});
