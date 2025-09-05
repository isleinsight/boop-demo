// auth/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../../db");

// Read your existing envs (minutes)
const TTL_MIN   = Number(process.env.JWT_VENDOR_ACCESS_TTL_MIN || 720);  // how long a vendor token lasts
const RENEW_MIN = Number(process.env.JWT_VENDOR_RENEW_WINDOW_MIN || 60); // renew when <= this many minutes remain

function isVendorLike(user) {
  const r = String(user?.role || user?.type || "").toLowerCase();
  return r === "vendor";
}

function signVendorToken(fromUser) {
  // keep the same identity fields that your tokens currently include
  const payload = {
    id: fromUser.id || fromUser.userId,
    email: fromUser.email,
    role: fromUser.role || "vendor",
    type: fromUser.type || "vendor",
    first_name: fromUser.first_name || null,
    last_name: fromUser.last_name || null,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TTL_MIN * 60 }); // minutes -> seconds
}

// 🔐 Main middleware: validates JWT and session, and renews vendor tokens when near expiry
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email; // session owner

    // 🔎 Check active session (also carries staff context if present)
    const { rows } = await pool.query(
      `SELECT email, jwt_token, staff_id, staff_username, staff_display_name
         FROM sessions
        WHERE email = $1 AND jwt_token = $2
        LIMIT 1`,
      [email, token]
    );
    if (!rows.length) {
      return res.status(403).json({ message: "Session not found or revoked" });
    }
    const sess = rows[0];

    // Attach decoded JWT + staff context
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

    // ➜ Sliding renewal ONLY for vendors
    if (isVendorLike(decoded) && decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      const remainingSec = decoded.exp - now;
      const renewThresholdSec = RENEW_MIN * 60;

      if (remainingSec <= renewThresholdSec) {
        const fresh = signVendorToken(decoded);

        // Swap token in the session row (preserves staff_* columns)
        await pool.query(
          `UPDATE sessions
              SET jwt_token = $1, updated_at = NOW()
            WHERE email = $2 AND jwt_token = $3`,
          [fresh, email, token]
        );

        // Frontend (vendor-common.js) stores this automatically
        res.setHeader("x-renew-jwt", fresh);
      }
    }

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
