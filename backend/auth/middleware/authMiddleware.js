// backend/auth/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../../db");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.warn("🚫 No token provided in Authorization header");
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    console.log("🔐 Token decoded:", decoded);

    // ✅ Look for session row with up-to-date token
    const sessionRes = await pool.query(
      `SELECT * FROM jwt_sessions WHERE user_id = $1 AND jwt_token = $2 AND is_online = true AND expires_at > NOW()`,
      [userId, token]
    );

    if (sessionRes.rows.length === 0) {
      console.warn("❌ Session not found, expired, or offline");
      return res.status(401).json({ message: "Session invalid or expired" });
    }

    const userRes = await pool.query(
      `SELECT id, force_signed_out FROM users WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      console.warn(`❌ User not found: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];

    if (user.force_signed_out) {
      console.warn(`⛔ User forcibly signed out: ${userId}`);
      return res.status(403).json({ message: "User is forcibly signed out" });
    }

    req.user = decoded;
    console.log(`✅ Authenticated user: ${userId}`);
    next();
  } catch (err) {
    console.error("🔥 JWT verification failed:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
