// backend/auth.js

const express = require('express');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Dummy login logic — replace with real database check later
  if (email === 'admin@example.com' && password === 'test123') {
    return res.status(200).json({ message: 'Login successful' });
  }

  res.status(401).json({ message: 'Invalid credentials' });
});

module.exports = router;
