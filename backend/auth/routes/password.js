// backend/auth/routes/password.js
const express = require('express');
const crypto = require('crypto');
const argon2 = require('argon2');
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// --- Postmark setup ---
const { ServerClient } = require('@postmark/node');
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';
const APP_URL = (process.env.APP_URL || 'http://localhost:8080').replace(/\/+$/, '');
const FROM_EMAIL =
  process.env.SENDER_EMAIL ||
  `no-reply@${new URL(APP_URL).hostname}`;
const postmark = POSTMARK_TOKEN ? new ServerClient(POSTMARK_TOKEN) : null;

const router = express.Router();

const TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TTL_MIN || 30);
const PASSWORD_MIN_LEN = Number(process.env.PASSWORD_MIN_LEN || 8);

// ───────── helpers ─────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= PASSWORD_MIN_LEN;
}
function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}
async function sendResetEmail(to, link) {
  if (!postmark) {
    console.warn('[email] Postmark token missing; logging link instead:', link);
    return;
  }
  await postmark.sendEmail({
    From: FROM_EMAIL,
    To: to,
    Subject: 'Reset your BOOP password',
    HtmlBody: `
      <p>Hello,</p>
      <p>We received a request to reset your password. Click the link below to set a new one:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link will expire in ${TOKEN_TTL_MIN} minutes. If you didn’t request this, you can ignore this email.</p>
    `,
    MessageStream: 'outbound',
  });
}

// ───────── routes ─────────

// ✅ Admin-initiated password reset (creates token & emails link)
router.post('/admin/initiate-reset', authenticateToken, async (req, res) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    const type = (req.user?.type || '').toLowerCase();
    const isAdmin = role === 'admin' && ['super_admin', 'admin', 'support', 'accountant', 'viewer', 'treasury'].includes(type);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const userIdFromBody = req.body?.user_id || req.body?.userId || null;
    const emailFromBody = normalizeEmail(req.body?.email || '');

    // Look up target user
    let userRow = null;
    if (userIdFromBody) {
      const { rows } = await db.query('SELECT id, email FROM users WHERE id = $1 LIMIT 1', [userIdFromBody]);
      userRow = rows[0];
    } else if (emailFromBody) {
      const { rows } = await db.query('SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [emailFromBody]);
      userRow = rows[0];
    } else {
      return res.status(400).json({ error: 'Provide user_id or email' });
    }
    if (!userRow) return res.status(404).json({ error: 'User not found' });

    // Create token row
    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userRow.id, tokenHash, expiresAt]
    );

    // Email link
    const link = `${APP_URL}/reset-password.html?token=${raw}`;
    await sendResetEmail(userRow.email, link);

    // Don’t return the link in production
    return res.json({ ok: true, message: 'Password reset email sent' });
  } catch (err) {
    console.error('Error in /admin/initiate-reset:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ User resets their password with the token
router.post('/reset', async (req, res) => {
  try {
    const { token, newPassword, new_password } = req.body || {};
    const pw = newPassword ?? new_password;

    if (!token || !pw) return res.status(400).json({ error: 'token and newPassword required' });
    if (!isValidPassword(pw)) {
      return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LEN} characters.` });
    }

    const tokenHash = hashToken(token);

    const { rows: trows } = await db.query(
      `SELECT id, user_id
         FROM password_reset_tokens
        WHERE token_hash=$1
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1`,
      [tokenHash]
    );
    if (!trows.length) return res.status(400).json({ error: 'Invalid or expired token' });

    const prtId = trows[0].id;
    const userId = trows[0].user_id;

    const newHash = await argon2.hash(pw);

    await db.query('BEGIN');
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, userId]);
    await db.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1', [prtId]);
    // Optional: force sign-out everywhere
    await db.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
    await db.query('COMMIT');

    return res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error in /reset:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Simple ping for testing mount
router.get('/ping', (_req, res) => res.json({ ok: true, route: '/api/password' }));

module.exports = router;
