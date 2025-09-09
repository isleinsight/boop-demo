// backend/auth/routes/register-cardholder.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../../db');

// Prefer argon2, fall back to bcryptjs
let hashPassword;
(async () => {
  try {
    const argon2 = require('argon2');
    hashPassword = (pw) => argon2.hash(pw);
    console.log('[signup] using argon2 for password hashing');
  } catch {
    const bcrypt = require('bcryptjs');
    hashPassword = async (pw) => bcrypt.hash(pw, 12);
    console.log('[signup] argon2 not found; using bcryptjs');
  }
})();

/* ---------- helpers ---------- */
const randHex = (n = 16) => crypto.randomBytes(n).toString('hex');
const makePassportId = () => 'PID-' + randHex(12);      // <= 64 chars (fits passports.passport_id)
const makePidToken   = () => 'PTK-' + randHex(24);
const makeCardUID    = () => 'CARD-' + randHex(12);

/**
 * POST /auth/register-cardholder
 * body: { first_name, middle_name?, last_name, email, password }
 */
router.post('/', async (req, res) => {
  const { first_name, middle_name, last_name, email, password } = req.body || {};

  // Basic validation
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: 'first_name, last_name, email and password are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (!cleanEmail.includes('@')) {
    return res.status(400).json({ message: 'Please provide a valid email.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) ensure email not taken
    const dupe = await client.query(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [cleanEmail]
    );
    if (dupe.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    // 2) hash password
    const password_hash = await hashPassword(password);

    // 3) create user
    // IMPORTANT: set *role* and *type* to 'cardholder' to satisfy your NOT NULL + CHECK constraints
    const userIns = await client.query(
      `
      INSERT INTO users
        (email, first_name, middle_name, last_name, password_hash, role, type, status)
      VALUES
        ($1,    $2,         $3,          $4,        $5,            'cardholder', 'cardholder', 'active')
      RETURNING id
      `,
      [cleanEmail, first_name.trim(), (middle_name || '').trim() || null, last_name.trim(), password_hash]
    );
    const userId = userIns.rows[0].id;

    // 4) create wallet (non-treasury, non-merchant) and link it
    const walletIns = await client.query(
      `INSERT INTO wallets (user_id, balance, is_treasury, is_merchant)
       VALUES ($1, 0, false, false)
       RETURNING id`,
      [userId]
    );
    const walletId = walletIns.rows[0].id;

    await client.query(
      `UPDATE users SET wallet_id = $1 WHERE id = $2`,
      [walletId, userId]
    );

    // 5) create passport in the *passports* table and link users.passport_pid
    const passport_id = makePassportId();
    const pid_token   = makePidToken();

    await client.query(
      `INSERT INTO passports (user_id, passport_id, pid_token)
       VALUES ($1, $2, $3)`,
      [userId, passport_id, pid_token]
    );

    await client.query(
      `UPDATE users SET passport_pid = $1 WHERE id = $2`,
      [passport_id, userId]
    );

    // 6) create an ACTIVE SPENDING card for this wallet (issued_by the user themself)
    const card_uid = makeCardUID();
    await client.query(
      `INSERT INTO cards (wallet_id, type, status, issued_by, uid)
       VALUES ($1, 'spending', 'active', $2, $3)`,
      [walletId, userId, card_uid]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      message: 'Cardholder created',
      user_id: userId,
      wallet_id: walletId,
      passport_id,
      card_uid
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ signup failed:', e);

    // Clean message for common cases
    const raw = String(e?.message || '');
    if (/unique/i.test(raw)) {
      return res.status(409).json({ message: 'A unique value already exists (email, passport, or card UID).' });
    }
    // If your DB still has an old trigger/function referencing "passport_ids", surface that clearly:
    if (/passport_ids/i.test(raw)) {
      return res.status(500).json({
        message: 'Database is referencing old table "passport_ids". Drop or fix any trigger/function that uses it (e.g., create_passport_for_user).'
      });
    }

    return res.status(500).json({ message: 'Failed to create account.' });
  } finally {
    client.release();
  }
});

module.exports = router;
