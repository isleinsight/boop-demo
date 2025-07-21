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

    const data = await res.json(); // ✅ always parse JSON, even on errors

    if (res.ok) {
      localStorage.setItem('boop_jwt', data.token);
      localStorage.setItem('boopUser', JSON.stringify(data.user));
      localStorage.setItem('admin_id', data.user.id);
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
