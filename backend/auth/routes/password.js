// backend/auth/routes/password.js
const express = require('express');
const crypto = require('crypto');
const argon2 = require('argon2');
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// ── Postmark setup ────────────────────────────────────────────────────────────
const { ServerClient } = require('postmark');

const APP_URL = (process.env.APP_URL || 'http://localhost:8080').replace(/\/+$/, '');
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';
const FROM_EMAIL =
  process.env.SENDER_EMAIL ||
  `no-reply@${new URL(APP_URL).hostname}`;
const postmark = POSTMARK_TOKEN ? new ServerClient(POSTMARK_TOKEN) : null;

// ── Config ───────────────────────────────────────────────────────────────────
const TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TTL_MIN || 30);
const PASSWORD_MIN_LEN = Number(process.env.PASSWORD_MIN_LEN || 8);

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────
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
    console.warn('[email] Postmark token missing; logging link instead:', { to, link });
    return;
  }
  try {
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
      TextBody:
        `Hello,\n\nWe received a request to reset your password.\n` +
        `Open this link to set a new one:\n${link}\n\n` +
        `This link will expire in ${TOKEN_TTL_MIN} minutes. If you didn’t request this, you can ignore this email.\n`,
      MessageStream: 'outbound',
    });
  } catch (e) {
    console.error('Postmark send failed:', e);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * Admin-initiated password reset
 * POST /api/password/admin/initiate-reset
 * Body: { user_id } OR { email }
 * Auth: admin (super_admin, admin, support, accountant, viewer, treasury)
 */
router.post('/admin/initiate-reset', authenticateToken, async (req, res) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    const type = (req.user?.type || '').toLowerCase();
    const isAdmin =
      role === 'admin' &&
      ['super_admin', 'admin', 'support', 'accountant', 'viewer', 'treasury'].includes(type);

    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const userIdFromBody = req.body?.user_id || req.body?.userId || null;
    const emailFromBody = normalizeEmail(req.body?.email);

    let userRow = null;
    if (userIdFromBody) {
      const { rows } = await db.query(
        'SELECT id, email FROM users WHERE id=$1 LIMIT 1',
        [userIdFromBody]
      );
      userRow = rows[0];
    } else if (emailFromBody) {
      const { rows } = await db.query(
        'SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',
        [emailFromBody]
      );
      userRow = rows[0];
    } else {
      return res.status(400).json({ error: 'Provide user_id or email' });
    }

    if (!userRow) return res.status(404).json({ error: 'User not found' });

    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userRow.id, tokenHash, expiresAt]
    );

    const link = `${APP_URL}/reset-password.html?token=${raw}`;
    await sendResetEmail(userRow.email, link);

    return res.json({ ok: true, message: 'Password reset email sent' });
  } catch (err) {
    console.error('admin/initiate-reset error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Public forgot-password
 * POST /api/password/forgot-password
 * Body: { email }
 * Always 200 to prevent user enumeration.
 */
router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  // Always respond 200
  res.json({ ok: true });

  if (!email) return;

  try {
    const { rows } = await db.query(
      'SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',
      [email]
    );
    if (!rows.length) return;

    const userId = rows[0].id;
    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userId, tokenHash, expiresAt]
    );

    const link = `${APP_URL}/reset-password.html?token=${raw}`;
    await sendResetEmail(email, link);
  } catch (err) {
    console.error('forgot-password error:', err);
    // swallow — we already returned 200
  }
});

/**
 * Reset password with token
 * POST /api/password/reset
 * Body: { token, newPassword }  (also accepts new_password)
 */
router.post('/reset', async (req, res) => {
  const { token, newPassword, new_password } = req.body || {};
  const pw = newPassword ?? new_password;

  if (!token || !pw) {
    return res.status(400).json({ error: 'token and newPassword required' });
  }
  if (!isValidPassword(pw)) {
    return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LEN} characters.` });
  }

  const tokenHash = hashToken(token);

  try {
    const { rows: trows } = await db.query(
      `SELECT id, user_id
         FROM password_reset_tokens
        WHERE token_hash=$1
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1`,
      [tokenHash]
    );
    if (!trows.length) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const prtId = trows[0].id;
    const userId = trows[0].user_id;

    const newHash = await argon2.hash(pw);

    await db.query('BEGIN');
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, userId]);
    await db.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1', [prtId]);

    // Optional: invalidate all other unused tokens for this user
    await db.query(
      `UPDATE password_reset_tokens
         SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL AND id <> $2`,
      [userId, prtId]
    );

    // Optional: force sign-out everywhere (if you keep sessions)
    await db.query('DELETE FROM sessions WHERE user_id=$1', [userId]);

    await db.query('COMMIT');

    return res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('reset error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Change password (logged in)
 * POST /api/password/change-password
 * Body: { current_password, new_password }
 * Auth required
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const userId = req.user?.userId ?? req.user?.id;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (!isValidPassword(new_password)) {
    return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LEN} characters.` });
  }

  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1 LIMIT 1', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const match = await argon2.verify(rows[0].password_hash, current_password);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await argon2.hash(new_password);

    await db.query('BEGIN');
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, userId]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [userId]); // force re-login elsewhere
    await db.query('COMMIT');

    return res.json({ ok: true });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('change-password error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Simple ping for testing
router.get('/ping', (_req, res) => res.json({ ok: true, route: '/api/password' }));

module.exports = router;
