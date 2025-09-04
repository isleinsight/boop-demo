const jwt = require("jsonwebtoken");
const pool = require("../../db");

/**
 * Helpers to decide who gets the long, sliding session.
 * Today: role/type === 'vendor' only.
 * (You can add 'vendor_cashier' later and include it here.)
 */
function isLongSessionUser(decoded) {
  const r = String(decoded?.role || "").toLowerCase().trim();
  const t = String(decoded?.type || "").toLowerCase().trim();
  return r === "vendor" || t === "vendor";
}

// env knobs (vendor-only)
const VENDOR_TTL_MIN   = Number(process.env.JWT_VENDOR_ACCESS_TTL_MIN || 960); // 16h
const VENDOR_RENEW_MIN = Number(process.env.JWT_VENDOR_RENEW_WINDOW_MIN || 30);
const JWT_SECRET       = process.env.JWT_SECRET;

/**
 * 🔐 Main middleware: validates JWT and requires a matching session row.
 * For vendors only, it enables a "sliding" renewal:
 * - if token is close to expiring, we mint a new one,
 * - update the sessions row, and
 * - send it back via `x-renew-jwt` header.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ message: "No token provided" });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET); // throws if invalid/expired
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }

  const email = decoded.email;
  if (!email) {
    return res.status(403).json({ message: "Invalid token (no email)" });
  }

  // 🔎 Require active session row matching this exact token
  try {
    const sessionCheck = await pool.query(
      `SELECT * FROM sessions WHERE email = $1 AND jwt_token = $2`,
      [email, token]
    );
    if (sessionCheck.rows.length === 0) {
      return res.status(403).json({ message: "Session not found or revoked" });
    }
  } catch (e) {
    return res.status(500).json({ message: "Session lookup failed" });
  }

  // Attach identity to request
  req.user = decoded;

  // ───────────────── Vendor-only sliding renewal ─────────────────
  try {
    if (isLongSessionUser(decoded)) {
      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = Number(decoded.exp || 0);
      const minsLeft = (expSec - nowSec) / 60;

      if (Number.isFinite(minsLeft) && minsLeft <= VENDOR_RENEW_MIN) {
        // Re-sign token with same claims (minus old iat/exp)
        const { iat, exp, ...claims } = decoded;
        const newToken = jwt.sign(claims, JWT_SECRET, { expiresIn: `${VENDOR_TTL_MIN}m` });

        // Update the sessions table to the new token so your exact-match check keeps working
        const upd = await pool.query(
          `UPDATE sessions SET jwt_token = $1 WHERE email = $2 AND jwt_token = $3`,
          [newToken, email, token]
        );

        // Only send header if we actually updated the row
        if (upd.rowCount > 0) {
          res.setHeader("x-renew-jwt", newToken);
        }
      }
    }
  } catch (_) {
    // If renewal fails for any reason, do not block the request—just continue with the current token.
  }

  return next();
}

// ✅ Optional role check (unchanged)
function requireAdminWithTypes(...allowedTypes) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || user.role !== "admin" || !allowedTypes.includes(user.type)) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    next();
  };
}

// ✅ Optional general auth (unchanged)
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
