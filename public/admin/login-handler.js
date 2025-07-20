document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      const { token, user } = data;

      // ✅ Store JWT and user info for session use
      localStorage.setItem("admin_id", user.id);
      localStorage.setItem("boop_jwt", token);
      localStorage.setItem("boopUser", JSON.stringify(user));

      // 🔓 Decode token to extract expiration
      function decodeJWT(token) {
        const payload = token.split('.')[1];
        const decoded = atob(payload);
        return JSON.parse(decoded);
      }
      const decoded = decodeJWT(token);
      const expiresAt = new Date(decoded.exp * 1000).toISOString();

      // 💾 Record session in DB
      try {
        const sessionRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            user_id: user.id,
            jwt_token: token,
            expires_at: expiresAt,
            status: "online"
          })
        });

        if (!sessionRes.ok) {
          const errData = await sessionRes.json();
          throw new Error(errData.message || "Session write failed");
        }

        console.log("📬 Admin session recorded.");
      } catch (sessionErr) {
        console.error("❌ Failed to record admin session:", sessionErr);
      }

      // 🔁 Redirect after successful login
      window.location.href = 'index.html';

    } else {
      document.getElementById('loginStatus').style.color = 'red';
      document.getElementById('loginStatus').textContent = data.message || 'Login failed';
    }

  } catch (err) {
    document.getElementById('loginStatus').style.color = 'red';
    document.getElementById('loginStatus').textContent = 'Error: ' + err.message;
  }
});
