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
const FROM_EMAIL = process.env.SENDER_EMAIL || `no-reply@${new URL(APP_URL).hostname}`;
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

// Email template (HTML + Text)
function renderResetEmail(link) {
  const logoUrl = `${APP_URL}/assets/Boop-Logo.png`; // must be publicly accessible
  const expiryMins = TOKEN_TTL_MIN;

  const HtmlBody = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset your BOOP password</title>
  <style>
    /* Client-safe inline-ish styles (kept simple for broad support) */
    .bg { background:#f6f8fb; padding:24px 12px; }
    .card { max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 24px rgba(16,24,40,0.08); }
    .header { background:#0b1220; padding:20px; text-align:center; }
    .logo { width:132px; height:auto; display:block; margin:0 auto; }
    .body { padding:28px 24px 8px; color:#1f2937; font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial; }
    h1 { margin:0 0 8px; font-size:20px; color:#111827; }
    p { margin:0 0 16px; }
    .btnwrap { text-align:center; padding:12px 0 24px; }
    .btn { display:inline-block; background:#2f80ed; color:#ffffff !important; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600; }
    .small { font-size:13px; color:#6b7280; }
    .linkbox { word-break:break-all; background:#f3f4f6; padding:10px; border-radius:8px; font-size:13px; }
    .footer { padding:16px 24px 28px; text-align:center; color:#9ca3af; font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial; }
  </style>
</head>
<body class="bg">
  <div class="card">
    <div class="header">
      <img class="logo" src="${logoUrl}" alt="BOOP" />
    </div>
    <div class="body">
      <h1>Reset your password</h1>
      <p>We received a request to reset your BOOP password. Click the button below to choose a new one.</p>
      <div class="btnwrap">
        <a class="btn" href="${link}" target="_blank" rel="noopener">Set new password</a>
      </div>
      <p class="small">This link expires in ${expiryMins} minutes. If you didn’t request this, you can ignore this email.</p>
      <p class="small">Having trouble with the button? Paste this link into your browser:</p>
      <div class="linkbox small">${link}</div>
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} BOOP. All rights reserved.
    </div>
  </div>
</body>
</html>`.trim();

  const TextBody =
    `Reset your BOOP password\n\n` +
    `We received a request to reset your password. Open the link below to set a new one.\n\n` +
    `${link}\n\n` +
    `This link expires in ${expiryMins} minutes. If you didn’t request this, you can ignore this email.\n`;

  return { HtmlBody, TextBody };
}

async function sendResetEmail(to, link) {
  if (!postmark) {
    console.warn('[email] Postmark token missing; logging link instead:', { to, link });
    return;
  }
  const { HtmlBody, TextBody } = renderResetEmail(link);
  try {
    await postmark.sendEmail({
      From: FROM_EMAIL,
      To: to,
      Subject: 'Reset your BOOP password',
      HtmlBody,
      TextBody,
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
      const { rows } = await db.query('SELECT id, email FROM users WHERE id=$1 LIMIT 1', [userIdFromBody]);
      userRow = rows[0];
    } else if (emailFromBody) {
      const { rows } = await db.query('SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [emailFromBody]);
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
    const { rows } = await db.query('SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
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
    // swallow — already returned 200
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

    // Invalidate any other outstanding tokens for this user
    await db.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL AND id <> $2`,
      [userId, prtId]
    );

    // Optional: force sign-out everywhere if you store sessions
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
