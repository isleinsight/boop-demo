// auth/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../../db");

// 🔐 Main middleware: validates JWT and session
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // We always keep the vendor’s email as the session owner email.
    const email = decoded.email;

    // 🔎 Check active session (now also carrying staff context if present)
    const sessionCheck = await pool.query(
      `SELECT email, jwt_token, staff_id, staff_username, staff_display_name
         FROM sessions
        WHERE email = $1 AND jwt_token = $2
        LIMIT 1`,
      [email, token]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(403).json({ message: "Session not found or revoked" });
    }

    const sess = sessionCheck.rows[0];

    // Attach decoded JWT plus staff context (if any) to req.user.
    // NOTE: decoded still contains your standard fields (id, email, role, type, exp, etc.)
    req.user = {
      ...decoded,
      staff: sess.staff_id
        ? {
            id: sess.staff_id,
            username: sess.staff_username || null,
            display_name: sess.staff_display_name || null,
          }
        : null,
    };

    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

// ✅ Optional role check
function requireAdminWithTypes(...allowedTypes) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || user.role !== "admin" || !allowedTypes.includes(user.type)) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    next();
  };
}

// ✅ Optional general auth
function requireAnyAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdminWithTypes,
  requireAnyAuth,
};
