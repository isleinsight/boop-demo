document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      // ✅ Login success — redirect to admin.html
      window.location.href = '/admin.html';
    } else {
      document.getElementById('loginStatus').style.color = 'red';
      document.getElementById('loginStatus').textContent = data.message || 'Login failed';
    }
  } catch (err) {
    document.getElementById('loginStatus').style.color = 'red';
    document.getElementById('loginStatus').textContent = 'Error: ' + err.message;
  }
});
