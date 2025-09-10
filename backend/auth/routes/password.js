// backend/auth/routes/password.js
const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// ✅ shared password helpers (argon2 or bcryptjs, chosen centrally)
const { hashPassword, verifyPassword } = require('../passwords');

// ── Postmark setup ────────────────────────────────────────────────────────────
const { ServerClient } = require('postmark');

// Point APP_URL to your Payulot site in .env (e.g., https://payulot.com)
const APP_URL = (process.env.APP_URL || 'https://payulot.com').replace(/\/+$/, '');

// From address must be verified in Postmark (set SENDER_EMAIL in .env)
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';
const FROM_EMAIL =
  process.env.SENDER_EMAIL ||
  `no-reply@${new URL(APP_URL).hostname}`;
const postmark = POSTMARK_TOKEN ? new ServerClient(POSTMARK_TOKEN) : null;

// ── Payulot branding ─────────────────────────────────────────────────────────
const BRAND_NAME = process.env.BRAND_NAME || 'Payulot';
const BRAND_PRIMARY = '#2f80ed';
const BRAND_NAV_DARK = '#0b1220';
// Your Payulot logo lives at /public/assets/logo.png
const BRAND_LOGO_URL = `${APP_URL}/assets/logo.png`;

// ── Config ───────────────────────────────────────────────────────────────────
const TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TTL_MIN || 60);
const PASSWORD_MIN_LEN = Number(process.env.PASSWORD_MIN_LEN || 8);

// ── Router ───────────────────────────────────────────────────────────────────
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

// Payulot-branded email HTML
function buildEmailHTML({ title, intro, ctaText, ctaUrl, footerNote }) {
  const safeIntro = intro || '';
  const safeFooter = footerNote || '';
  const host = new URL(APP_URL).hostname;

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light only">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background:#f6f8fb; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Poppins, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f8fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(16,24,40,.08);">
            <tr>
              <td style="background:${BRAND_NAV_DARK}; padding:20px 24px;" align="left">
                <img src="${BRAND_LOGO_URL}" width="140" height="auto" alt="${BRAND_NAME}" style="display:block; border:0; outline:none;">
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px; color:#111827;">
                <h1 style="margin:0 0 8px 0; font-size:22px; line-height:1.3; font-weight:600; color:#111827;">
                  ${title}
                </h1>
                <p style="margin:0; color:#4b5563; font-size:15px; line-height:1.6;">
                  ${safeIntro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 4px 28px;">
                <a href="${ctaUrl}" style="display:inline-block; background:${BRAND_PRIMARY}; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:10px; font-weight:600;">
                  ${ctaText}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0 28px;">
                <p style="margin:0; color:#6b7280; font-size:13px;">
                  Or paste this link into your browser:<br>
                  <a href="${ctaUrl}" style="color:${BRAND_PRIMARY}; word-break:break-all;">${ctaUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px 28px;">
                <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.5;">
                  ${safeFooter}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px; background:#f9fafb; color:#6b7280; font-size:12px;">
                Sent by ${BRAND_NAME} • <a href="${APP_URL}" style="color:#6b7280; text-decoration:none;">${host}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function postmarkSend({ to, subject, html, text }) {
  if (!postmark) {
    console.warn('[email] Postmark token missing; would have sent:', { to, subject });
    return;
  }
  await postmark.sendEmail({
    From: FROM_EMAIL,
    To: to,
    Subject: subject,
    HtmlBody: html,
    TextBody: text || '',
    MessageStream: 'outbound',
  });
}

// Pretty wrappers with Payulot copy
async function sendAccountSetupEmail(to, link) {
  const subject = `Finish setting up your ${BRAND_NAME} account`;
  const html = buildEmailHTML({
    title: `Welcome to ${BRAND_NAME}`,
    intro: `Your ${BRAND_NAME} account was created. Click the button below to set your password and finish setup.
            This link expires in ${TOKEN_TTL_MIN} minutes.`,
    ctaText: 'Set up your password',
    ctaUrl: link,
    footerNote: `If you didn’t expect this, you can ignore this email.`,
  });
  const text =
    `Welcome to ${BRAND_NAME}.\n\n` +
    `Set your password here (expires in ${TOKEN_TTL_MIN} minutes):\n${link}\n\n` +
    `If you didn’t expect this, ignore this email.`;
  await postmarkSend({ to, subject, html, text });
}

async function sendAdminResetEmail(to, link) {
  const subject = `Admin reset link for your ${BRAND_NAME} account`;
  const html = buildEmailHTML({
    title: `Reset your ${BRAND_NAME} password`,
    intro: `An administrator started a password reset for your ${BRAND_NAME} account.
            Use the button below to choose a new password.
            This link expires in ${TOKEN_TTL_MIN} minutes.`,
    ctaText: 'Reset password',
    ctaUrl: link,
    footerNote: `Didn’t expect this? Contact support or ignore this email.`,
  });
  const text =
    `An administrator initiated a password reset for your ${BRAND_NAME} account.\n\n` +
    `Reset link (expires in ${TOKEN_TTL_MIN} minutes):\n${link}\n\n` +
    `If you didn’t expect this, contact support or ignore this email.`;
  await postmarkSend({ to, subject, html, text });
}

async function sendForgotEmail(to, link) {
  const subject = `Reset your ${BRAND_NAME} password`;
  const html = buildEmailHTML({
    title: `Reset your ${BRAND_NAME} password`,
    intro: `We received a request to reset your password.
            Click the button below to set a new one.
            This link expires in ${TOKEN_TTL_MIN} minutes.`,
    ctaText: 'Reset password',
    ctaUrl: link,
    footerNote: `If you didn’t request a reset, you can safely ignore this email.`,
  });
  const text =
    `We received a request to reset your ${BRAND_NAME} password.\n\n` +
    `Reset link (expires in ${TOKEN_TTL_MIN} minutes):\n${link}\n\n` +
    `If you didn’t request this, ignore this email.`;
  await postmarkSend({ to, subject, html, text });
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * Admin-initiated password reset (distinct subject/copy)
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

    // Find target user
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

    // Create token
    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userRow.id, tokenHash, expiresAt]
    );

    // Email (admin flavor)
    const link = `${APP_URL}/password.html?token=${raw}`;
    await sendAdminResetEmail(userRow.email, link);

    return res.json({ ok: true, message: 'Admin reset email sent' });
  } catch (err) {
    console.error('admin/initiate-reset error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Public forgot-password (distinct subject/copy)
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

    // Create token
    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userId, tokenHash, expiresAt]
    );

    // Email (forgot flavor)
    const link = `${APP_URL}/password.html?token=${raw}`;
    await sendForgotEmail(email, link);
  } catch (err) {
    console.error('forgot-password error:', err);
    // do nothing else—we already returned 200
  }
});

/**
 * (Optional) Admin-initiated ACCOUNT SETUP email (creation flavor)
 * Useful if you want to trigger the “finish setup” email from here too.
 * POST /api/password/admin/initiate-setup
 * Body: { user_id } OR { email }
 */
router.post('/admin/initiate-setup', authenticateToken, async (req, res) => {
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

    // Create token
    const raw = generateToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userRow.id, tokenHash, expiresAt]
    );

    // Email (account setup flavor)
    const link = `${APP_URL}/password.html?token=${raw}`;
    await sendAccountSetupEmail(userRow.email, link);

    return res.json({ ok: true, message: 'Account setup email sent' });
  } catch (err) {
    console.error('admin/initiate-setup error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
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

    const newHash = await hashPassword(pw); // ✅ unified hasher

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

    // Optional: force sign-out everywhere
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

    const match = await verifyPassword(current_password, rows[0].password_hash); // ✅ unified verifier
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await hashPassword(new_password); // ✅ unified hasher

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
