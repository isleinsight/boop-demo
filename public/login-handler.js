document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const expectedRole = form.dataset.role;
  const redirectTo = form.dataset.redirect;

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const status = document.getElementById('loginStatus');

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      const role = data.user.role;

      // ✅ Save token and user
      localStorage.setItem("boop_jwt", data.token);
      localStorage.setItem("boopUser", JSON.stringify(data.user));

      // ✅ Role validation
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
