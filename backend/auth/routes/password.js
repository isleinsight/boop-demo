// backend/auth/routes/password.js
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');

// ✅ Robust, absolute resolve to backend/db.js
const db = require(path.resolve(__dirname, '..', '..', 'db.js'));

const { hashPassword, verifyPassword } = require('../passwords');
const { authenticateToken } = require('../middleware/authMiddleware');

// ── Email (Postmark) ─────────────────────────────────────────────────────────
const { ServerClient } = require('postmark');

// Public site for links:
const RESET_BASE_URL = (process.env.RESET_BASE_URL || process.env.APP_URL || 'https://payulot.com').replace(/\/+$/,'');
// Where the logo image lives:
const ASSET_BASE     = (process.env.ASSET_BASE     || 'https://payulot.com').replace(/\/+$/,'');

const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';
const FROM_EMAIL     = process.env.SENDER_EMAIL || `no-reply@${new URL(RESET_BASE_URL).hostname}`;
const postmark       = POSTMARK_TOKEN ? new ServerClient(POSTMARK_TOKEN) : null;

// ── Config ───────────────────────────────────────────────────────────────────
const TOKEN_TTL_MIN    = Number(process.env.PASSWORD_RESET_TTL_MIN || 60);
const PASSWORD_MIN_LEN = Number(process.env.PASSWORD_MIN_LEN || 8);

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────
const genToken  = () => crypto.randomBytes(32).toString('hex');
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const okPw      = (pw) => typeof pw === 'string' && pw.length >= PASSWORD_MIN_LEN;
const normEmail = (e)  => String(e || '').trim().toLowerCase();

function buildEmailHTML({ title, intro, ctaText, ctaUrl, footerNote }) {
  const logoUrl = `${ASSET_BASE}/assets/logo.png`; // Payulot logo
  return `
<!doctype html><html><head>
  <meta charset="utf-8"><meta name="color-scheme" content="light only">
  <meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
</head><body style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Poppins,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f8fb;">
    <tr><td align="center" style="padding:24px;">
      <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(16,24,40,.08);">
        <tr><td style="background:#0f1e33;padding:20px 24px;" align="left">
          <img src="${logoUrl}" width="140" alt="Payulot" style="display:block;border:0;outline:none;">
        </td></tr>
        <tr><td style="padding:28px 28px 8px 28px;color:#111827;">
          <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;font-weight:600;color:#111827;">${title}</h1>
          <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">${intro || ''}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 4px 28px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#2f80ed;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">${ctaText}</a>
        </td></tr>
        <tr><td style="padding:8px 28px 0 28px;">
          <p style="margin:0;color:#6b7280;font-size:13px;">Or paste this link into your browser:<br>
            <a href="${ctaUrl}" style="color:#2f80ed;word-break:break-all;">${ctaUrl}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px 28px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">${footerNote || ''}</p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">
          Sent by Payulot • <a href="${RESET_BASE_URL}" style="color:#6b7280;text-decoration:none;">${new URL(RESET_BASE_URL).hostname}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendMail({ to, subject, html, text }) {
  if (!postmark) { console.warn('[email] Postmark token missing; would have sent:', { to, subject }); return; }
  await postmark.sendEmail({ From: FROM_EMAIL, To: to, Subject: subject, HtmlBody: html, TextBody: text || '', MessageStream: 'outbound' });
}

const emailVariants = {
  setup: (to, link) => sendMail({
    to,
    subject: 'Finish setting up your Payulot account',
    html: buildEmailHTML({
      title: 'Welcome to Payulot',
      intro: `Your Payulot account was created. Click the button below to set your password and finish setup.
              This link expires in ${TOKEN_TTL_MIN} minutes.`,
      ctaText: 'Set up your password',
      ctaUrl: link,
      footerNote: 'If you didn’t expect this, you can ignore this email.'
    }),
    text:
      `Welcome to Payulot.\n\n` +
      `Set your password here (expires in ${TOKEN_TTL_MIN} minutes):\n${link}\n\n` +
      `If you didn’t expect this, ignore this email.`
  }),
  adminReset: (to, link) => sendMail({
    to,
    subject: 'Admin reset link for your Payulot account',
    html: buildEmailHTML({
      title: 'Reset your Payulot password',
      intro: `An administrator started a password reset for your Payulot account.
              Use the button below to choose a new password.
              This link expires in ${TOKEN_TTL_MIN} minutes.`,
      ctaText: 'Reset password',
      ctaUrl: link,
      footerNote: `Didn’t expect this? Contact support or ignore this email.`
    }),
    text:
      `An administrator initiated a password reset for your Payulot account.\n\n` +
      `Reset link (expires in ${TOKEN_TTL_MIN} minutes):\n${link}\n\n` +
      `If you didn’t expect this, contact support or ignore this email.`
  }),
  forgot: (to, link) => sendMail({
    to,
    subject: 'Reset your Payulot password',
    html: buildEmailHTML({
      title: 'Reset your Payulot password',
      intro: `We received a request to reset your password.
              Click the button below to set a new one.
              This link expires in ${TOKEN_TTL_MIN} minutes.`,
      ctaText: 'Reset password',
      ctaUrl: link,
      footerNote: `If you didn’t request a reset, you can safely ignore this email.`
    }),
    text:
      `We received a request to reset your Payulot password.\n\n` +
      `Reset link (expires in ${TOKEN_TTL_MIN} minutes):\n${link}\n\n` +
      `If you didn’t request this, ignore this email.`
  }),
};

// ── Routes ───────────────────────────────────────────────────────────────────

// Admin-initiated reset
router.post('/admin/initiate-reset', authenticateToken, async (req, res) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    const type = (req.user?.type || '').toLowerCase();
    const isAdmin = role === 'admin' &&
      ['super_admin','admin','support','accountant','viewer','treasury'].includes(type);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const userId = req.body?.user_id || req.body?.userId || null;
    const email  = normEmail(req.body?.email);

    let user = null;
    if (userId) {
      ({ rows: [user] } = await db.query('SELECT id, email FROM users WHERE id=$1 LIMIT 1', [userId]));
    } else if (email) {
      ({ rows: [user] } = await db.query('SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]));
    } else {
      return res.status(400).json({ error: 'Provide user_id or email' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });

    const raw = genToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
      [user.id, tokenHash, expiresAt]
    );

    const link = `${RESET_BASE_URL}/password.html?mode=reset&token=${raw}`;
    await emailVariants.adminReset(user.email, link);

    res.json({ ok: true, message: 'Admin reset email sent' });
  } catch (err) {
    console.error('admin/initiate-reset error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Public forgot password (always 200)
router.post('/forgot-password', async (req, res) => {
  const email = normEmail(req.body?.email);
  res.json({ ok: true }); // prevent enumeration
  if (!email) return;

  try {
    const { rows: [user] } = await db.query(
      'SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',
      [email]
    );
    if (!user) return;

    const raw = genToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
      [user.id, tokenHash, expiresAt]
    );

    const link = `${RESET_BASE_URL}/password.html?mode=forgot&token=${raw}`;
    await emailVariants.forgot(user.email, link);
  } catch (err) {
    console.error('forgot-password error:', err);
  }
});

// Optional admin-initiated account setup
router.post('/admin/initiate-setup', authenticateToken, async (req, res) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    const type = (req.user?.type || '').toLowerCase();
    const isAdmin = role === 'admin' &&
      ['super_admin','admin','support','accountant','viewer','treasury'].includes(type);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const userId = req.body?.user_id || req.body?.userId || null;
    const email  = normEmail(req.body?.email);

    let user = null;
    if (userId) {
      ({ rows: [user] } = await db.query('SELECT id, email FROM users WHERE id=$1 LIMIT 1', [userId]));
    } else if (email) {
      ({ rows: [user] } = await db.query('SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]));
    } else {
      return res.status(400).json({ error: 'Provide user_id or email' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });

    const raw = genToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
      [user.id, tokenHash, expiresAt]
    );

    const link = `${RESET_BASE_URL}/password.html?mode=reset&token=${raw}`;
    await emailVariants.setup(user.email, link);

    res.json({ ok: true, message: 'Account setup email sent' });
  } catch (err) {
    console.error('admin/initiate-setup error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Reset with token
router.post('/reset', async (req, res) => {
  const { token, newPassword, new_password } = req.body || {};
  const pw = newPassword ?? new_password;
  if (!token || !pw) return res.status(400).json({ error: 'token and newPassword required' });
  if (!okPw(pw))   return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LEN} characters.` });

  const tokenHash = hashToken(token);

  try {
    const { rows: [t] } = await db.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    if (!t) return res.status(400).json({ error: 'Invalid or expired token' });

    const newHash = await hashPassword(pw);

    await db.query('BEGIN');
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, t.user_id]);
    await db.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1', [t.id]);
    await db.query(
      `UPDATE password_reset_tokens SET used_at=NOW()
       WHERE user_id=$1 AND used_at IS NULL AND id<>$2`,
      [t.user_id, t.id]
    );
    await db.query('DELETE FROM sessions WHERE user_id=$1', [t.user_id]);
    await db.query('COMMIT');

    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    await db.query('ROLLBACK').catch(()=>{});
    console.error('reset error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Change password (logged in)
router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const userId = req.user?.userId ?? req.user?.id;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Missing fields' });
  if (!okPw(new_password)) return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LEN} characters.` });

  try {
    const { rows: [row] } = await db.query('SELECT password_hash FROM users WHERE id=$1 LIMIT 1', [userId]);
    if (!row) return res.status(404).json({ error: 'User not found' });

    const match = await verifyPassword(current_password, row.password_hash);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await hashPassword(new_password);

    await db.query('BEGIN');
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, userId]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
    await db.query('COMMIT');

    res.json({ ok: true });
  } catch (err) {
    await db.query('ROLLBACK').catch(()=>{});
    console.error('change-password error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Ping
router.get('/ping', (_req, res) => res.json({ ok: true, route: '/api/password' }));
module.exports = router;
