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
    const userId = decoded.id;
    const userEmail = decoded.email;

    console.log("🔐 Token decoded:", decoded);

    // 1️⃣ Check if session exists for this user AND is active
    const sessionRes = await pool.query(
      `SELECT * FROM jwt_sessions 
       WHERE user_id = $1 AND jwt_token = $2 AND status = 'online' AND expires_at > NOW()`,
      [userId, token]
    );

    if (sessionRes.rows.length === 0) {
      console.warn("❌ Session not found, expired, or offline");
      return res.status(401).json({ message: "Session is invalid or expired" });
    }

    // 2️⃣ Check if user is force signed out
    const userRes = await pool.query(
      `SELECT force_signed_out FROM users WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      console.warn(`❌ User not found in DB: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    if (userRes.rows[0].force_signed_out) {
      console.warn(`⛔ User forcibly signed out: ${userId}`);
      return res.status(403).json({ message: "User is forcibly signed out" });
    }

    // ✅ Auth success
    req.user = decoded;
    console.log(`✅ Authenticated user: ${userId}`);
    next();

  } catch (err) {
    console.error("🔥 JWT verification failed:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
