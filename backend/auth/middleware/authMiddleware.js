const jwt = require("jsonwebtoken");
const pool = require("../../db");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const sessionCheck = await pool.query(
      `SELECT * FROM sessions WHERE email = $1 AND jwt_token = $2`,
      [email, token]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(403).json({ message: "Session not found or revoked" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

// ✅ Treasury admin middleware
function requireTreasuryAdmin(req, res, next) {
  const user = req.user;
  if (!user || user.role !== "admin" || !["treasury", "accountant"].includes(user.type)) {
    return res.status(403).json({ message: "Unauthorized" });
  }
  next();
}

// ✅ Export both
module.exports = {
  authenticateToken,
};
