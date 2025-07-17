document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

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
      localStorage.setItem("boop_jwt", data.token);
      localStorage.setItem("boopUser", JSON.stringify(data.user));

      const role = data.user.role;

      if (["cardholder", "student", "senior"].includes(role)) {
        // ✅ Redirect to main dashboard (public index)
        window.location.href = "/index.html";
      } else {
        // ❌ Not allowed here — clear and block
        status.style.color = 'red';
        status.textContent = "Unauthorized role.";
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
