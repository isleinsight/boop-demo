document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const expectedRole = form.dataset.role;     // e.g. "cardholder"
  const redirectTo = form.dataset.redirect;   // e.g. "cardholder.html"

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const status = document.getElementById('loginStatus');

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        audience: expectedRole
      })
    });

    const data = await res.json();

    if (res.ok) {
      const role = data.user.role;

      // ✅ Save token + user info
      localStorage.setItem("boop_jwt", data.token);
      localStorage.setItem("boopUser", JSON.stringify(data.user));

      // ✅ Decode token
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      const expiresAt = new Date(payload.exp * 1000).toISOString();

      // 📨 Post session record
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.user.email,
          user_id: data.user.id,
          jwt_token: data.token,
          expires_at: expiresAt,
          status: "online"
        })
      });

      // ✅ Role check + redirect
      const allowedRoles = {
        cardholder: ["cardholder", "student", "senior"],
        parent: ["parent"],
        vendor: ["vendor"]
      };

      if (allowedRoles[expectedRole]?.includes(role)) {
        window.location.href = redirectTo;
      } else {
        status.style.color = 'red';
        status.textContent = "Unauthorized role for this login.";
        localStorage.clear();
      }

    } else {
      status.style.color = 'red';
      status.textContent = data.message || 'Login failed';
    }
  } catch (err) {
    status.style.color = 'red';
    status.textContent = 'Error: ' + err.message;
  }
});
