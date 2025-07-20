// backend/auth/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../../db");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.warn("🚫 No token provided");
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userEmail = decoded.email;

    console.log("🔐 Token decoded for:", userEmail);

    // 🔍 Check session in DB
    const result = await pool.query(
      "SELECT * FROM sessions WHERE email = $1 AND status = 'online'",
      [userEmail]
    );

    if (result.rows.length === 0) {
      console.warn(`❌ No active session found for ${userEmail}`);
      return res.status(403).json({ message: "Session expired or revoked" });
    }

    // ✅ Allow through
    req.user = decoded;
    next();

  } catch (err) {
    console.error("🔥 JWT error:", err.message);
    return res.status(403).json({ message: "Invalid token" });
  }
}

module.exports = authenticateToken;
