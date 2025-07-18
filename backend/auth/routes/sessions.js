const express = require('express');
const pool = require('../../db');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

// 🔐 Middleware to ensure user is super_admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Forbidden: Admins only' });
  }
  next();
}

// GET all active sessions
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.email, u.role
      FROM jwt_sessions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('🔥 Error fetching sessions:', err.message);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// DELETE a specific session by ID
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM jwt_sessions WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('🔥 Failed to delete session:', err.message);
    res.status(500).json({ error: 'Could not delete session' });
  }
});

// DELETE all sessions for a given user
router.delete('/user/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM jwt_sessions WHERE user_id = $1`, [req.params.userId]);
    res.json({ message: 'All sessions for user deleted' });
  } catch (err) {
    console.error('🔥 Failed to delete user sessions:', err.message);
    res.status(500).json({ error: 'Could not delete user sessions' });
  }
});

// DELETE expired sessions
router.delete('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM jwt_sessions WHERE expires_at <= NOW()`);
    res.json({ message: `Deleted ${result.rowCount} expired session(s)` });
  } catch (err) {
    console.error('🔥 Failed to clear expired sessions:', err.message);
    res.status(500).json({ error: 'Could not delete expired sessions' });
  }
});

module.exports = router;
