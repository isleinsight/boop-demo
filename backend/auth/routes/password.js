// backend/auth/routes/password.js
const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// ✅ shared password helpers
const { hashPassword, verifyPassword } = require('../passwords');

// ── Postmark setup ────────────────────────────────────────────────────────────
const { ServerClient } = require('postmark');

// Always use Payulot site for reset links
const RESET_BASE_URL = 'https://payulot.com';

// But keep sender as boopcard (Postmark verified)
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';
const FROM_EMAIL = process.env.SENDER_EMAIL || 'no-reply@boopcard.com';
const postmark = POSTMARK_TOKEN ? new ServerClient(POSTMARK_TOKEN) : null;

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

function buildEmailHTML({ title, intro, ctaText, ctaUrl, footerNote }) {
  const logoUrl = `${RESET_BASE_URL}/assets/logo.png`; // ✅ Payulot logo
  const safeIntro = intro || '';
  const safeFooter = footerNote || '';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light only">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background:#f6f8fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Poppins, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f8fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(16,24,40,.08);">
            <tr>
              <td style="background:#1a2b4a; padding:20px 24px;" align="left">
                <img src="${logoUrl}" width="140" height="auto" alt="Payulot" style="display:block; border:0; outline:none;">
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
                <a href="${ctaUrl}" style="display:inline-block; background:#2f80ed; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:10px; font-weight:600;">
                  ${ctaText}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0 28px;">
                <p style="margin:0; color:#6b7280; font-size:13px;">
                  Or paste this link into your browser:<br>
                  <a href="${ctaUrl}" style="color:#2f80ed; word-break:break-all;">${ctaUrl}</a>
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
                Sent by Payulot • <a href="${RESET_BASE_URL}" style="color:#6b7280; text-decoration:none;">payulot.com</a>
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

// ── Email types ──────────────────────────────────────────────────────────────
async function sendAccountSetupEmail(to, link) {
  const subject = 'Finish setting up your Payulot account';
  const html = buildEmailHTML({
    title: 'Welcome to Payulot',
    intro: `Your Payulot account was created. Click below to set your password and finish setup.
            This link expires in ${TOKEN_TTL_MIN} minutes.`,
    ctaText: 'Set up your password',
    ctaUrl: link,
    footerNote: `If you didn’t expect this, you can ignore this email.`,
  });
  await postmarkSend({ to, subject, html, text: `${subject}\n${link}` });
}

async function sendAdminResetEmail(to, link) {
  const subject = 'Admin reset link for your Payulot account';
  const html = buildEmailHTML({
    title: 'Reset your Payulot password',
    intro: `An administrator started a password reset for your Payulot account.
            Use the button below to choose a new password.`,
    ctaText: 'Reset password',
    ctaUrl: link,
    footerNote: `Didn’t expect this? Contact support or ignore this email.`,
  });
  await postmarkSend({ to, subject, html, text: `${subject}\n${link}` });
}

async function sendForgotEmail(to, link) {
  const subject = 'Reset your Payulot password';
  const html = buildEmailHTML({
    title: 'Reset your Payulot password',
    intro: `We received a request to reset your password.
            Click below to set a new one.`,
    ctaText: 'Reset password',
    ctaUrl: link,
    footerNote: `If you didn’t request a reset, you can ignore this email.`,
  });
  await postmarkSend({ to, subject, html, text: `${subject}\n${link}` });
}

// ── Routes (reset, forgot, setup, change) ─────────────────────────────────────
// (same as before, just links updated to `${RESET_BASE_URL}/password.html?mode=reset&token=${raw}`)
// ...
