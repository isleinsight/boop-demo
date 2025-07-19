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
    const userId = decoded.userId || decoded.id;
    console.log(`🔐 Token decoded:`, decoded);

    // 🔁 Retry session check for race condition
    const maxAttempts = 5;
    const delayMs = 100;
    let session = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const sessionRes = await pool.query(
        `SELECT * FROM jwt_sessions WHERE user_id = $1 AND jwt_token = $2 AND expires_at > NOW()`,
        [userId, token]
      );

      if (sessionRes.rows.length > 0) {
        session = sessionRes.rows[0];
        console.log(`✅ Session found on attempt ${attempt}`);
        break;
      }

      if (attempt < maxAttempts) {
        console.log(`⏳ Session not found (attempt ${attempt}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    if (!session) {
      console.warn("❌ Session not found or expired after retries");
      return res.status(401).json({ message: "Session is invalid or expired" });
    }

    // ⛔ Check force_signed_out flag
    const userRes = await pool.query(
      `SELECT id, force_signed_out FROM users WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      console.warn(`❌ User not found in DB: ${userId}`);
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
    console.error("🔥 JWT middleware error:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
