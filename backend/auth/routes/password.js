const express = require('express');
const router = express.Router();
const pool = require('../../db'); // adjust path if your db connection file is elsewhere
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/authMiddleware');

// ✅ Admin-initiated password reset (sends token link)
router.post('/admin/initiate-reset', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Check user exists
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const email = rows[0].email;
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // TODO: send email here
    console.log(`🔑 Password reset token for ${email}: ${token}`);

    res.json({ message: 'Password reset link generated', token });
  } catch (err) {
    console.error('Error in /admin/initiate-reset:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ User resets their password with the token
router.post('/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword required' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, payload.userId]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error in /reset:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Optional: simple ping for testing mount
router.get('/ping', (req, res) => {
  res.json({ ok: true, route: '/api/password' });
});

module.exports = router;
