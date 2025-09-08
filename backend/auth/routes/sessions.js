const express = require('express');
const router = express.Router();
const pool = require('../../db');

/**
 * POST /api/sessions
 * Create/refresh a session.
 * - Vendors may have multiple sessions.
 * - Non-vendors may have only one active session (we delete others).
 * - We also clear users.force_signed_out on successful login to avoid instant boot.
 * Body: { email, user_id, jwt_token, status?, expires_at?, role? }
 */
router.post('/', async (req, res) => {
  let { email, user_id, jwt_token, status, expires_at, role } = req.body || {};

  if (!email || !user_id || !jwt_token) {
    return res.status(400).json({ message: 'email, user_id, and jwt_token are required' });
  }

  const sessStatus = status || 'online';

  try {
    // Get role if not provided
    if (!role) {
      const r = await pool.query('SELECT role FROM users WHERE id = $1::uuid LIMIT 1', [user_id]);
      role = (r.rows[0]?.role || '').toString();
    }
    const isVendor = (role || '').toLowerCase() === 'vendor';

    // Do everything atomically
    await pool.query('BEGIN');

    // Non-vendors: ensure only one session remains (keep the current token)
    if (!isVendor) {
      await pool.query(
        `DELETE FROM sessions
           WHERE user_id = $1::uuid
             AND jwt_token <> $2`,
        [user_id, jwt_token]
      );
    }

    // Upsert by unique (jwt_token)
    await pool.query(
      `INSERT INTO sessions (user_id, email, jwt_token, status, expires_at, last_seen)
       VALUES ($1::uuid, $2, $3, $4, $5, NOW())
       ON CONFLICT (jwt_token) DO UPDATE
         SET status = EXCLUDED.status,
             expires_at = EXCLUDED.expires_at,
             last_seen = NOW(),
             email = EXCLUDED.email,
             user_id = EXCLUDED.user_id`,
      [user_id, email, jwt_token, sessStatus, expires_at || null]
    );

    // ✅ Clear force flag so the client won't immediately log you out
    await pool.query(
      `UPDATE users SET force_signed_out = FALSE WHERE id = $1::uuid AND force_signed_out IS TRUE`,
      [user_id]
    );

    await pool.query('COMMIT');
    return res.status(201).json({ message: 'Session recorded' });
  } catch (err) {
    try { await pool.query('ROLLBACK'); } catch {}
    console.error('🔥 Failed to upsert session:', err);
    return res.status(500).json({ message: 'Session insert failed' });
  }
});

/**
 * PATCH /api/sessions/seen
 * Touch last_seen for a token.
 * Body: { jwt_token }
 */
router.patch('/seen', async (req, res) => {
  const { jwt_token } = req.body || {};
  if (!jwt_token) return res.status(400).json({ message: 'jwt_token is required' });

  try {
    const r = await pool.query(
      `UPDATE sessions SET last_seen = NOW() WHERE jwt_token = $1`,
      [jwt_token]
    );
    return res.json({ updated: r.rowCount });
  } catch (err) {
    console.error('❌ touch last_seen failed:', err);
    return res.status(500).json({ message: 'Failed to update last_seen' });
  }
});

/**
 * POST /api/sessions/signout
 * Remove a single session by token.
 * Body: { jwt_token }
 */
router.post('/signout', async (req, res) => {
  const { jwt_token } = req.body || {};
  if (!jwt_token) return res.status(400).json({ message: 'jwt_token is required' });

  try {
    const r = await pool.query(`DELETE FROM sessions WHERE jwt_token = $1`, [jwt_token]);
    return res.json({ deleted: r.rowCount });
  } catch (err) {
    console.error('❌ signout (token) failed:', err);
    return res.status(500).json({ message: 'Failed to sign out' });
  }
});

/**
 * DELETE /api/sessions/:email
 * Remove all sessions for an email (admin/helper).
 */
router.delete('/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(`DELETE FROM sessions WHERE email = $1`, [email]);
    if (result.rowCount > 0) return res.json({ message: `Sessions for ${email} deleted` });
    return res.status(404).json({ message: 'No sessions found' });
  } catch (err) {
    console.error('🔥 Failed to delete session(s):', err);
    return res.status(500).json({ message: 'Session deletion failed' });
  }
});

/**
 * GET /api/sessions/force-check/:email
 * Check if the user has been force-signed-out.
 */
router.get('/force-check/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(`SELECT force_signed_out FROM users WHERE email = $1`, [email]);
    if (!result.rows.length) return res.status(404).json({ message: 'User not found' });
    return res.json({ force_signed_out: !!result.rows[0].force_signed_out });
  } catch (err) {
    console.error('❌ Error checking force sign-out:', err);
    return res.status(500).json({ message: 'Failed to check sign-out status' });
  }
});

/**
 * PATCH /api/sessions/force-clear/:email
 * Clear the force-signed-out flag (e.g., on logout).
 */
router.patch('/force-clear/:email', async (req, res) => {
  const { email } = req.params;
  try {
    await pool.query(`UPDATE users SET force_signed_out = FALSE WHERE email = $1`, [email]);
    return res.json({ message: 'Force sign-out cleared.' });
  } catch (err) {
    console.error('❌ Error clearing force sign-out:', err);
    return res.status(500).json({ message: 'Failed to clear sign-out flag' });
  }
});

module.exports = router;
