const jwt = require("jsonwebtoken");
const pool = require("../../db");

// 🔐 Main middleware: validates JWT and session
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    // 🔎 Check active session match
    const sessionCheck = await pool.query(
      `SELECT * FROM sessions WHERE email = $1 AND jwt_token = $2`,
      [email, token]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(403).json({ message: "Session not found or revoked" });
    }

    req.user = decoded; // attach user to request
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

// 🔒 Role + type check: require admin with allowed type(s)
function requireAdminWithTypes(...allowedTypes) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || user.role !== "admin" || !allowedTypes.includes(user.type)) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    next();
  };
}

// 🧪 Optional: require any authenticated user
function requireAnyAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdminWithTypes,
  requireAnyAuth
};
