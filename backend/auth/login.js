// backend/login.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('./db');

module.exports = async function (req, res) {
  const { email, password, audience } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  // 🎯 Role access control based on login source
  const roleMap = {
    admin: ["admin", "super_admin"],
    cardholder: ["cardholder", "student", "senior"],
    parent: ["parent"],
    vendor: ["vendor"]
  };

  if (!audience || !roleMap[audience]) {
    return res.status(400).json({ message: "Missing or invalid login audience" });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];

    if (typeof user.password_hash !== 'string') {
      console.error('❌ Invalid password hash type:', typeof user.password_hash);
      return res.status(500).json({ message: 'Password hash corrupted' });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ message: "Unauthorized role for this login" });
    }

    await pool.query("UPDATE users SET force_signed_out = false WHERE id = $1", [user.id]);

    // ✅ Token creation
    const tokenPayload = {
      userId: user.id,
      role: user.role,
      email: user.email,
      type: user.type,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });

    console.log("🔐 Token created for user ID:", user.id);
    console.log("📦 Token payload:", tokenPayload);

    // ✅ Save session
    try {
      const sessionInsert = await pool.query(
        `INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
         VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours') RETURNING *`,
        [user.id, token]
      );
      console.log('✅ Session inserted:', sessionInsert.rows[0]);
    } catch (err) {
      console.error('❌ Failed to insert session into jwt_sessions:', err.message);
    }

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        type: user.type,
        name: `${user.first_name} ${user.last_name}`
      }
    });

  } catch (err) {
    console.error('🔥 Login error:', err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
};
