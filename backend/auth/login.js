// backend/login.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('./db'); // uses .env from db.js

module.exports = async function (req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];

    if (typeof user.password_hash !== 'string') {
      console.error('❌ Invalid password hash type:', typeof user.password_hash);
      return res.status(500).json({ message: 'Server error: password hash corrupted' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (typeof jwtSecret !== 'string' || jwtSecret.trim() === '') {
      console.error('❌ JWT_SECRET is missing or invalid.');
      return res.status(500).json({ message: 'Server misconfigured: JWT secret missing' });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        email: user.email,
        type: user.type,
      },
      jwtSecret,
      { expiresIn: '2h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        type: user.type,
        name: `${user.first_name} ${user.last_name}`
      }
    });

  } catch (err) {
    console.error('🔥 Login error:', err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
};
