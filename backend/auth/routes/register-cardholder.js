// backend/auth/routes/register-cardholder.js
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../../db');

const router = express.Router();

router.post('/', async (req, res) => {
  const { first_name, middle_name, last_name, email, password } = req.body;

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user with type = 'cardholder'
    const result = await pool.query(
      `INSERT INTO users (first_name, middle_name, last_name, email, password_hash, type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'cardholder', 'active', now(), now())
       RETURNING id, first_name, middle_name, last_name, email, type`,
      [first_name, middle_name || null, last_name, email.toLowerCase(), password_hash]
    );

    const user = result.rows[0];
    res.status(201).json({ message: 'Account created', user });

  } catch (err) {
    console.error('Error registering cardholder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
