// backend/login.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const pool = require('./db');

// 🔍 Utility to log messages persistently
function logToFile(message) {
  fs.appendFileSync('login-debug.log', `${new Date().toISOString()} - ${message}\n`);
}

module.exports = async function (req, res) {
  const { email, password, audience } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

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
    logToFile(`🔑 Login attempt for: ${email} (audience: ${audience})`);

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      logToFile('❌ User not found or inactive');
      return res.status(401).json({ message: 'Invalid credentials (user not found)' });
    }

    const user = result.rows[0];
    logToFile(`✅ User found: ${user.id}, role: ${user.role}`);

    if (typeof user.password_hash !== 'string') {
      logToFile(`❌ Invalid password hash type: ${typeof user.password_hash}`);
      return res.status(500).json({ message: 'Password hash corrupted' });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    logToFile(`🔍 Password match result: ${match}`);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials (wrong password)' });
    }

    const allowedRoles = roleMap[audience];
    if (!allowedRoles.includes(user.role)) {
      logToFile(`❌ Unauthorized role: ${user.role} for audience: ${audience}`);
      return res.status(403).json({ message: "Unauthorized role for this login" });
    }

    await pool.query("UPDATE users SET force_signed_out = false WHERE id = $1", [user.id]);

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        email: user.email,
        type: user.type,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    logToFile(`🧾 JWT created for user ID: ${user.id}`);
    logToFile(`🧪 Token: ${token}`);

    try {
      const insertResult = await pool.query(
        `INSERT INTO jwt_sessions (user_id, jwt_token, created_at, expires_at)
         VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 hours') RETURNING *`,
        [user.id, token]
      );
      logToFile(`✅ Session inserted into jwt_sessions: ${JSON.stringify(insertResult.rows[0])}`);
    } catch (err) {
      logToFile(`❌ Failed to insert session: ${err.message}`);
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
    logToFile(`🔥 Login error: ${err.message}`);
    res.status(500).json({ message: 'Server error during login' });
  }
};
