// backend/auth/routes/login.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../../db');

// Try to load argon2 and bcryptjs (fallbacks are safe)
let argon2;
let bcrypt;
try { argon2 = require('argon2'); } catch {}
try { bcrypt = require('bcryptjs'); } catch {}

// Verify function that supports both hash types
async function verifyPassword(plain, hashed) {
  if (!hashed || !plain) return false;

  // Prefer format hints first
  if (argon2 && typeof hashed === 'string' && hashed.startsWith('$argon2')) {
    try { return await argon2.verify(hashed, plain); } catch {}
  }
  if (bcrypt && typeof hashed === 'string' && hashed.startsWith('$2')) {
    try { return await bcrypt.compare(plain, hashed); } catch {}
  }

  // If format check didn’t early-return, try both to cover migrated data
  if (argon2) { try { if (await argon2.verify(hashed, plain)) return true; } catch {} }
  if (bcrypt) { try { if (await bcrypt.compare(plain, hashed)) return true; } catch {} }

  return false;
}

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

    // Look up user by normalized email
    const { rows } = await pool.query(
      `SELECT id, email, role, type, status,
              first_name, middle_name, last_name,
              wallet_id, password_hash, force_signed_out
         FROM users
        WHERE lower(email) = $1
        LIMIT 1`,
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }
    const user = rows[0];

    // Block non-active if you want
    if (user.status && String(user.status).toLowerCase() !== 'active') {
      return res.status(403).json({ message: 'This account is not active.' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
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
      userId: user.id, // keep legacy name some frontends expect
      email: user.email,
      role: effectiveRole,
      type: effectiveRole,
      first_name: user.first_name,
      last_name: user.last_name
    };
    const token = jwt.sign(payload, secret, { expiresIn: ttlSeconds });

    // ---- Session policy ----
    if (effectiveRole === 'vendor') {
      // Vendor owner: clear prior owner sessions (keep cashiers: staff_id IS NOT NULL)
      await pool.query(
        `DELETE FROM sessions
          WHERE email = $1
            AND staff_id IS NULL`,
        [user.email]
      );
    } else {
      // Non-vendor (cardholder, student, parent): keep a single active session
      await pool.query(
        `DELETE FROM sessions
          WHERE user_id = $1
            AND COALESCE(status, 'online') = 'online'`,
        [user.id]
      );
    }

    // Insert fresh session (expires matches JWT)
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
