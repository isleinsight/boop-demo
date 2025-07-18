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
    console.log(`🔐 Token decoded for user ID: ${userId}`);

    // ✅ 1. Check if token exists in jwt_sessions and not expired
    const sessionRes = await pool.query(
      `SELECT * FROM jwt_sessions WHERE jwt_token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (sessionRes.rows.length === 0) {
      console.warn("❌ Token is not in jwt_sessions or expired");
      return res.status(401).json({ message: "Session is invalid or expired" });
    }

    // ✅ 2. Check if user is force signed out
    const userRes = await pool.query(
      `SELECT force_signed_out FROM users WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      console.warn("❌ User not found in DB for ID:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    if (userRes.rows[0].force_signed_out) {
      console.warn(`⛔ User ${userId} is forcibly signed out`);
      return res.status(403).json({ message: "User is forcibly signed out" });
    }

    console.log(`✅ Authenticated user: ${userId}`);
    req.user = decoded;
    next();

  } catch (err) {
    console.error("🔥 Auth error:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
