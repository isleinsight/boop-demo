// backend/auth/routes/password.js
// Robust password flows: forgot / reset / change

const express = require('express');
const crypto = require('crypto');
const argon2 = require('argon2');
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * ENV you can set:
 * - APP_URL=https://boopcard.com
 * - PASSWORD_RESET_TTL_MIN=30
 * - PASSWORD_MIN_LEN=8
 */
const APP_URL = process.env.APP_URL || 'http://localhost:8080';
const TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TTL_MIN || 30);
const PASSWORD_MIN_LEN = Number(process.env.PASSWORD_MIN_LEN || 8);

// ───────────────── helpers ─────────────────
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

// super simple in-memory rate limiter (good enough to start; move to Redis later)
const rl = new Map(); // key -> { count, ts }
function rateLimit(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = rl.get(key);
  if (!entry || now - entry.ts > windowMs) {
    rl.set(key, { count: 1, ts: now });
    return false; // not limited
  }
  entry.count += 1;
  if (entry.count > limit) return true; // limited
  return false;
}

// TODO: plug in your email provider here
async function sendResetEmail(to, link) {
  // e.g., Postmark/Sendgrid/SES — keep it simple to start
  console.log(`[email] password reset → ${to} → ${link}`);
}

// ───────────────── routes ─────────────────

/**
 * POST /auth/password/admin/initiate-reset
 * Admin only. Body: { user_id } or { email }
 * Creates a reset token and emails the link (same flow as forgot-password).
 */
router.post('/admin/initiate-reset', authenticateToken, async (req, res) => {
  try {
    const { role, type } = req.user || {};
    const isAdmin = role === 'admin' && ['super_admin','support','accountant','viewer','treasury'].includes((type||'').toLowerCase());
    if (!isAdmin) return res.status(403).json({ message: 'Not authorized.' });

    const userIdFromBody = req.body?.user_id;
    const emailFromBody = normalizeEmail(req.body?.email);

    // look up the user by id or email
    let userRow = null;
    if (userIdFromBody) {
      const { rows } = await db.query('SELECT id, email FROM users WHERE id=$1 LIMIT 1', [userIdFromBody]);
      userRow = rows[0];
    } else if (emailFromBody) {
      const { rows } = await db.query('SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [emailFromBody]);
      userRow = rows[0];
    } else {
      return res.status(400).json({ message: 'Provide user_id or email.' });
    }

    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    // create token
    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userRow.id, tokenHash, expiresAt]
    );

    const link = `${APP_URL.replace(/\/+$/,'')}/reset-password.html?token=${raw}`;
    await sendResetEmail(userRow.email, link);

    // don’t leak the link in production responses
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin/initiate-reset error', err);
    return res.status(500).json({ message: 'Failed to initiate reset.' });
  }
});

/**
 * POST /auth/password/forgot-password
 * Body: { email }
 * Always 200. If user exists, creates token + emails link.
 */
router.post('/forgot-password', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const email = normalizeEmail(req.body?.email);

  // Always return 200 to avoid user enumeration
  res.json({ ok: true });

  // Basic validation + rate limiting
  if (!email) return;
  if (rateLimit(`fp:${ip}`, 20, 15 * 60 * 1000)) return;
  if (rateLimit(`fp:${email}`, 5, 15 * 60 * 1000)) return;

  try {
    const { rows: users } = await db.query(
      'SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',
      [email]
    );
    if (!users.length) return;

    const userId = users[0].id;
    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userId, tokenHash, expiresAt]
    );

    const link = `${APP_URL.replace(/\/+$/,'')}/reset-password.html?token=${raw}`;
    await sendResetEmail(email, link);
  } catch (err) {
    console.error('forgot-password error', err);
    // swallow errors — we already responded 200
  }
});

/**
 * POST /auth/password/reset-password
 * Body: { token, new_password }
 */
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) {
    return res.status(400).json({ message: 'Missing token or password.' });
  }
  if (!isValidPassword(new_password)) {
    return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LEN} characters.` });
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
    if (!trows.length) return res.status(400).json({ message: 'Invalid or expired token.' });

    const prtId = trows[0].id;
    const userId = trows[0].user_id;

    const newHash = await argon2.hash(new_password);

    await db.query('BEGIN');
    await db.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newHash, userId]);
    await db.query(`UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1`, [prtId]);
    // Invalidate active sessions (if you keep a sessions table)
    await db.query(`DELETE FROM sessions WHERE user_id=$1`, [userId]);
    await db.query('COMMIT');

    return res.json({ ok: true });
  } catch (err) {
    await db.query('ROLLBACK').catch(()=>{});
    console.error('reset-password error', err);
    return res.status(500).json({ message: 'Could not reset password.' });
  }
});

/**
 * POST /auth/password/change-password
 * Auth required
 * Body: { current_password, new_password }
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const userId = req.user?.userId ?? req.user?.id;

  if (!current_password || !new_password) {
    return res.status(400).json({ message: 'Missing fields.' });
  }
  if (!isValidPassword(new_password)) {
    return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LEN} characters.` });
  }

  try {
    const { rows } = await db.query(
      'SELECT password_hash FROM users WHERE id=$1 LIMIT 1',
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found.' });

    const match = await argon2.verify(rows[0].password_hash, current_password);
    if (!match) return res.status(400).json({ message: 'Current password is incorrect.' });

    const hash = await argon2.hash(new_password);

    await db.query('BEGIN');
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, userId]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [userId]); // force re-login elsewhere
    await db.query('COMMIT');

    return res.json({ ok: true });
  } catch (err) {
    await db.query('ROLLBACK').catch(()=>{});
    console.error('change-password error', err);
    return res.status(500).json({ message: 'Could not change password.' });
  }
});

module.exports = router;
