/**
 * auth/routes/sessions.js
 *
 * Sessions API
 * - POST   /api/sessions           → upsert (role-aware: vendors can have many)
 * - POST   /api/sessions/logout    → mark a single token offline (recommended)
 * - DELETE /api/sessions/:email    → legacy removal by email (kept for compat)
 * - DELETE /api/sessions/by-token/:token → remove by token (optional helper)
 * - GET    /api/sessions/force-check/:email  → read users.force_signed_out
 * - PATCH  /api/sessions/force-clear/:email  → clear users.force_signed_out
 *
 * DB prerequisites created in step #1:
 *   ALTER TABLE sessions ADD COLUMN IF NOT EXISTS role text;
 *   CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique ON sessions(jwt_token);
 *   CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_online_per_user_non_vendor
 *     ON sessions(user_id)
 *     WHERE (COALESCE(lower(role),'') <> 'vendor' AND lower(COALESCE(status,'')) = 'online');
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function resolveRole({ user_id, email }) {
  // We prefer user_id; fall back to email if needed
  if (!user_id && !email) return null;
  const q = await pool.query(
    `SELECT role FROM users WHERE ($1::bigint IS NOT NULL AND id = $1) OR ($2::text IS NOT NULL AND email = $2) LIMIT 1`,
    [user_id || null, email || null]
  );
  return (q.rows[0]?.role || null);
}

function normStatus(s) {
  const v = String(s || 'online').toLowerCase();
  return v === 'offline' ? 'offline' : 'online';
}

// ─────────────────────────────────────────────────────────────
// POST /api/sessions  → upsert session (role-aware)
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { email, user_id, jwt_token, expires_at, status, role: rawRole } = req.body || {};

  if (!email || !jwt_token || !user_id) {
    return res.status(400).json({ message: 'Email, user_id, and JWT token are required' });
  }

  try {
    // Determine role (prefer payload, else look it up)
    const dbRole = rawRole || (await resolveRole({ user_id, email })) || '';
    const role = String(dbRole).toLowerCase();
    const safeStatus = normStatus(status);

    if (role === 'vendor') {
      // VENDOR: allow multiple concurrent sessions.
      // Keep sessions unique per token so replays update last_seen cleanly.
      await pool.query(
        `
        INSERT INTO sessions (user_id, role, email, jwt_token, status, expires_at, last_seen)
        VALUES ($1,      $2,   $3,    $4,        $5,     $6,         NOW())
        ON CONFLICT ON CONSTRAINT sessions_token_unique
        DO UPDATE SET
          last_seen  = NOW(),
          expires_at = EXCLUDED.expires_at,
          status     = EXCLUDED.status,
          email      = EXCLUDED.email,
          role       = EXCLUDED.role
        `,
        [user_id, role, email, jwt_token, safeStatus, expires_at || null]
      );

      return res.status(201).json({ message: 'Vendor session recorded/updated' });
    }

    // NON-VENDOR: exactly one online session per user (partial unique index).
    // If a new login happens, we "take over" the online row.
    await pool.query(
      `
      INSERT INTO sessions (user_id, role, email, jwt_token, status, expires_at, last_seen)
      VALUES ($1,      $2,   $3,    $4,        'online', $5,         NOW())
      ON CONFLICT ON CONSTRAINT sessions_one_online_per_user_non_vendor
      DO UPDATE SET
        jwt_token  = EXCLUDED.jwt_token,
        expires_at = EXCLUDED.expires_at,
        status     = 'online',
        last_seen  = NOW(),
        email      = EXCLUDED.email,
        role       = EXCLUDED.role
      `,
      [user_id, role || null, email, jwt_token, expires_at || null]
    );

    return res.status(201).json({ message: 'Session recorded/updated' });
  } catch (err) {
    // Common cause of 42P10: the expected constraint/index wasn’t created.
    if (err?.code === '42P10') {
      console.error('❌ ON CONFLICT target missing. Did you run the migration from step #1?', err);
      return res.status(500).json({
        message:
          'Server session constraint missing. Please run the sessions indexes migration.'
      });
    }
    console.error('🔥 Failed to upsert session:', err);
    return res.status(500).json({ message: 'Session insert/update failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/sessions/logout  → mark a single token offline
// This is “step #3” from the plan.
// Call this when a client logs out so non-vendor users can sign in elsewhere.
// ─────────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { user_id, jwt_token } = req.body || {};
  if (!user_id || !jwt_token) {
    return res.status(400).json({ message: 'user_id and jwt_token are required' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE sessions
      SET status = 'offline', last_seen = NOW()
      WHERE user_id = $1 AND jwt_token = $2
      `,
      [user_id, jwt_token]
    );

    // 200 even if nothing matched; client logout should be idempotent
    return res.status(200).json({
      message: result.rowCount > 0 ? 'Session marked offline' : 'No matching session (already offline?)'
    });
  } catch (err) {
    console.error('❌ Failed to mark session offline:', err);
    return res.status(500).json({ message: 'Logout failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// Legacy/utility endpoints (optional)
// ─────────────────────────────────────────────────────────────

// Delete by email (kept for backward compatibility)
router.delete('/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(`DELETE FROM sessions WHERE email = $1`, [email]);
    if (result.rowCount > 0) {
      res.json({ message: `Sessions for ${email} deleted` });
    } else {
      res.status(404).json({ message: 'No sessions found for email' });
    }
  } catch (err) {
    console.error('❌ Failed to delete session(s) by email:', err);
    res.status(500).json({ message: 'Session deletion failed' });
  }
});

// Delete a specific session by token (handy for admin tools)
router.delete('/by-token/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(`DELETE FROM sessions WHERE jwt_token = $1`, [token]);
    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('❌ Failed to delete by token:', err);
    res.status(500).json({ message: 'Session deletion failed' });
  }
});

// Check a user’s force sign-out flag
router.get('/force-check/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const r = await pool.query(`SELECT force_signed_out FROM users WHERE email = $1`, [email]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ force_signed_out: !!r.rows[0].force_signed_out });
  } catch (err) {
    console.error('❌ Error checking force sign-out:', err);
    res.status(500).json({ message: 'Failed to check sign-out status' });
  }
});

// Clear force sign-out flag
router.patch('/force-clear/:email', async (req, res) => {
  const { email } = req.params;
  try {
    await pool.query(`UPDATE users SET force_signed_out = false WHERE email = $1`, [email]);
    res.status(200).json({ message: 'Force sign-out cleared.' });
  } catch (err) {
    console.error('❌ Error clearing force sign-out:', err);
    res.status(500).json({ message: 'Failed to clear sign-out flag' });
  }
});

module.exports = router;
