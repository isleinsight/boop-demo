document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      // ✅ Login successful — redirect or show message
      window.location.href = 'dashboard.html'; // Change this to your actual destination
    } else {
      document.getElementById('loginStatus').textContent = data.error || 'Login failed.';
    }

  } catch (err) {
    console.error(err);
    document.getElementById('loginStatus').textContent = 'An error occurred. Please try again.';
  }
});
