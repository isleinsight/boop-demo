// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../../db');

// unified password verifier (supports argon2 + bcryptjs)
const { verifyPassword } = require('../passwords'); // <-- uses auth/passwords.js

function toPublicUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role || u.type || null,
    type: u.type || u.role || null,
    first_name: u.first_name,
    middle_name: u.middle_name || null,
    last_name: u.last_name,
    wallet_id: u.wallet_id,
    force_signed_out: !!u.force_signed_out,
    status: u.status
  };
}

router.post('/', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const { rows } = await pool.query(
      `SELECT id, email, role, type, status,
              first_name, middle_name, last_name,
              wallet_id, password_hash, force_signed_out
         FROM users
        WHERE lower(email) = $1
        LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user) {
      console.log('[login] no user for', email);
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    // quick visibility: what kind of hash is in DB?
    const prefix = (user.password_hash || '').slice(0, 15);
    console.log('[login] user:', user.email, 'hash prefix:', prefix || '(null)');

    if (!user.password_hash) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    if (user.status && String(user.status).toLowerCase() !== 'active') {
      return res.status(403).json({ message: 'This account is not active.' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      console.log('[login] password mismatch for', user.email);
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Server missing JWT secret' });
    }

    const effectiveRole = user.role || user.type || 'cardholder';
    const ACCESS_TTL_MIN = Number(process.env.JWT_VENDOR_ACCESS_TTL_MIN || 960); // 16h default
    const ttlSeconds = ACCESS_TTL_MIN * 60;

    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: effectiveRole,
      type: effectiveRole,
      first_name: user.first_name,
      last_name: user.last_name
    };
    const token = jwt.sign(payload, secret, { expiresIn: ttlSeconds });

    // session policy
    if (effectiveRole === 'vendor') {
      await pool.query(
        `DELETE FROM sessions
          WHERE email = $1
            AND staff_id IS NULL`,
        [user.email]
      );
    } else {
      await pool.query(
        `DELETE FROM sessions
          WHERE user_id = $1
            AND COALESCE(status, 'online') = 'online'`,
        [user.id]
      );
    }

    await pool.query(
      `INSERT INTO sessions
         (user_id, email, jwt_token, role, status, expires_at, last_seen)
       VALUES
         ($1,      $2,    $3,        $4,   'online', now() + ($5 || ' seconds')::interval, now())
       ON CONFLICT DO NOTHING`,
      [user.id, user.email, token, effectiveRole, String(ttlSeconds)]
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: toPublicUser(user)
    });
  } catch (err) {
    console.error('🔥 /auth/login error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
