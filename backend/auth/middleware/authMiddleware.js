const jwt = require("jsonwebtoken");
const pool = require("../../db");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    console.log("🔐 Token decoded:", decoded);

    // 1️⃣ Lookup session by email
    const sessionRes = await pool.query(
      `SELECT * FROM jwt_sessions WHERE email = $1 AND status = 'online' AND expires_at > NOW()`,
      [email]
    );

    if (sessionRes.rows.length === 0) {
      console.warn("❌ Session not found, expired, or offline");
      return res.status(401).json({ message: "Session invalid or expired" });
    }

    // 2️⃣ Ensure user isn't suspended
    const userRes = await pool.query(
      `SELECT id, force_signed_out, status FROM users WHERE email = $1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];

    if (user.force_signed_out || user.status !== 'active') {
      return res.status(403).json({ message: "Access denied (suspended or signed out)" });
    }

    req.user = decoded;
    next();

  } catch (err) {
    console.error("🔥 JWT verification failed:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
