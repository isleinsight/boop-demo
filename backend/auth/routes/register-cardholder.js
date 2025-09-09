// backend/auth/routes/register-cardholder.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../../db');

// Prefer argon2, fall back to bcryptjs (no native build required)
let hashPassword;
(() => {
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

/** helpers */
function randHex(nBytes = 16) {
  return crypto.randomBytes(nBytes).toString('hex');
}
function passportId() { return 'PID-' + randHex(12); }      // <= 64 chars
function pidToken()   { return 'PTK-' + randHex(24); }
function cardUID()    { return 'CARD-' + randHex(12); }

/**
 * POST /auth/register-cardholder
 * body: { first_name, middle_name?, last_name, email, password }
 */
router.post('/', async (req, res) => {
  const { first_name, middle_name, last_name, email, password } = req.body || {};

  // basic validation
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

    // 3) create user (role/type = cardholder, status = active)
    const userIns = await client.query(
      `
      INSERT INTO users (
        email, first_name, middle_name, last_name,
        password_hash, role, type, status
      )
      VALUES ($1, $2, $3, $4, $5, 'cardholder', 'cardholder', 'active')
      RETURNING id
      `,
      [
        cleanEmail,
        first_name.trim(),
        (middle_name || '').trim() || null,
        last_name.trim(),
        password_hash
      ]
    );
    const userId = userIns.rows[0].id;

    // 4) create wallet for the user and link it back to users.wallet_id
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

    // 5) create passport and set users.passport_pid
    const ppid = passportId();
    const ptoken = pidToken();
    await client.query(
      `INSERT INTO passports (user_id, passport_id, pid_token)
       VALUES ($1, $2, $3)`,
      [userId, ppid, ptoken]
    );
    await client.query(
      `UPDATE users SET passport_pid = $1 WHERE id = $2`,
      [ppid, userId]
    );

    // 6) create a SPENDING card for this wallet (self-issued by the new user)
    const uid = cardUID();
    await client.query(
      `INSERT INTO cards (wallet_id, type, status, issued_by, uid)
       VALUES ($1, 'spending', 'active', $2, $3)`,
      [walletId, userId, uid]
    );

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Cardholder created',
      user_id: userId,
      wallet_id: walletId,
      passport_id: ppid,
      card_uid: uid
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ signup failed:', e);
    const msg = /unique/i.test(String(e?.message))
      ? 'A unique constraint failed (email, passport, or card UID).'
      : 'Failed to create account.';
    res.status(500).json({ message: msg });
  } finally {
    client.release();
  }
});

module.exports = router;
