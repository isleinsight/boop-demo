const express = require('express');
const router = express.Router();
const pool = require('../../db');

// ✅ Insert or update a session
router.post('/', async (req, res) => {
  const { email, user_id, jwt_token, status, expires_at } = req.body;

  if (!email || !jwt_token || !user_id) {
    return res.status(400).json({ message: "Email, user_id, and JWT token are required" });
  }

  try {
    await pool.query(`
      INSERT INTO sessions (user_id, email, jwt_token, status, expires_at, last_seen)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (email) DO UPDATE
        SET jwt_token = EXCLUDED.jwt_token,
            status = EXCLUDED.status,
            expires_at = EXCLUDED.expires_at,
            last_seen = NOW()
    `, [user_id, email, jwt_token, status || 'online', expires_at]);

    res.status(201).json({ message: "Session recorded or updated" });
  } catch (err) {
    console.error("🔥 Failed to upsert session:", err);
    res.status(500).json({ message: "Session insert/update failed" });
  }
});

// ❌ Delete session by email
router.delete('/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const result = await pool.query(`DELETE FROM sessions WHERE email = $1`, [email]);
    if (result.rowCount > 0) {
      res.json({ message: `Session for ${email} deleted` });
    } else {
      res.status(404).json({ message: "Session not found" });
    }
  } catch (err) {
    console.error("🔥 Failed to delete session:", err);
    res.status(500).json({ message: "Session deletion failed" });
  }
});

module.exports = router;
