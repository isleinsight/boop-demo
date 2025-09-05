// auth/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../../db");

/**
 * Long-lived vendor sessions with automatic renewal.
 *
 * ENV (add to .env if not already):
 *   JWT_VENDOR_EXPIRES=43200                 # 12h in seconds (or your desired length)
 *   VENDOR_RENEW_THRESHOLD_SECONDS=7200      # renew when < 2h remain
 *   VENDOR_RENEW_GRACE_SECONDS=900           # allow 15m grace after expiry to auto-renew
 */

const VENDOR_MAX_AGE = Number(process.env.JWT_VENDOR_EXPIRES || 43200);
const VENDOR_RENEW_THRESHOLD = Number(process.env.VENDOR_RENEW_THRESHOLD_SECONDS || 7200);
const VENDOR_RENEW_GRACE = Number(process.env.VENDOR_RENEW_GRACE_SECONDS || 900);

function isVendorUser(decoded) {
  const role = String(decoded?.role || "").toLowerCase();
  return role === "vendor";
}

async function findSession(email, token) {
  const { rows } = await pool.query(
    `SELECT email, jwt_token, staff_id, staff_username, staff_display_name
       FROM sessions
      WHERE email = $1 AND jwt_token = $2
      LIMIT 1`,
    [email, token]
  );
  return rows[0] || null;
}

async function replaceSessionToken(email, oldToken, newToken, staffCtx) {
  // replace the row in a single statement
  await pool.query(
    `UPDATE sessions
        SET jwt_token = $1,
            staff_id = COALESCE($2, staff_id),
            staff_username = COALESCE($3, staff_username),
            staff_display_name = COALESCE($4, staff_display_name)
      WHERE email = $5
        AND jwt_token = $6`,
    [
      newToken,
      staffCtx?.id || null,
      staffCtx?.username || null,
      staffCtx?.display_name || null,
      email,
      oldToken,
    ]
  );
}

function signVendorToken(decodedBase) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  // copy minimal profile fields from previous token
  const payload = {
    id: decodedBase.id,
    email: decodedBase.email,
    role: decodedBase.role || "vendor",
    type: decodedBase.type || "vendor",
    first_name: decodedBase.first_name || null,
    last_name: decodedBase.last_name || null,
  };
  return jwt.sign(payload, secret, { expiresIn: VENDOR_MAX_AGE });
}

// 🔐 Main middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  let decoded = null;

  try {
    // First, try normal verify
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // If expired, consider vendor grace renewal
    if (err && err.name === "TokenExpiredError") {
      try {
        const decodedExpired = jwt.verify(token, process.env.JWT_SECRET, {
          ignoreExpiration: true,
        });
        // Vendor only: try grace renewal if a matching session exists
        if (isVendorUser(decodedExpired)) {
          const email = decodedExpired.email;
          const sess = await findSession(email, token);
          if (sess) {
            const nowSec = Math.floor(Date.now() / 1000);
            const expSec = Number(decodedExpired.exp || 0);
            const ageOver = nowSec - expSec; // seconds past expiry
            if (ageOver >= 0 && ageOver <= VENDOR_RENEW_GRACE) {
              const fresh = signVendorToken(decodedExpired);
              // Update session to new token
              const staffCtx = sess.staff_id
                ? {
                    id: sess.staff_id,
                    username: sess.staff_username || null,
                    display_name: sess.staff_display_name || null,
                  }
                : null;
              await replaceSessionToken(email, token, fresh, staffCtx);
              // attach and emit new token
              res.setHeader("x-renew-jwt", fresh);
              decoded = jwt.verify(fresh, process.env.JWT_SECRET); // finalize decoded
            } else {
              return res.status(403).json({ message: "Invalid or expired token" });
            }
          } else {
            return res.status(403).json({ message: "Session not found or revoked" });
          }
        } else {
          return res.status(403).json({ message: "Invalid or expired token" });
        }
      } catch {
        return res.status(403).json({ message: "Invalid or expired token" });
      }
    } else {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
  }

  // At this point we have a valid decoded token (either original or renewed)
  const email = decoded.email;
  const sess = await findSession(email, token).catch(() => null);

  // If we just renewed above, sess may not match the *old* token. Try with the new one from header:
  let finalSession = sess;
  if (!finalSession) {
    const candidate = res.getHeader("x-renew-jwt");
    if (candidate) {
      finalSession = await findSession(email, candidate).catch(() => null);
    }
  }

  if (!finalSession) {
    return res.status(403).json({ message: "Session not found or revoked" });
  }

  // Attach req.user (+ staff context if present)
  req.user = {
    ...decoded,
    staff: finalSession.staff_id
      ? {
          id: finalSession.staff_id,
          username: finalSession.staff_username || null,
          display_name: finalSession.staff_display_name || null,
        }
      : null,
  };

  // If vendor token is getting close to expiry, proactively renew
  if (isVendorUser(decoded)) {
    const nowSec = Math.floor(Date.now() / 1000);
    const timeLeft = Number(decoded.exp || 0) - nowSec;
    if (timeLeft > 0 && timeLeft <= VENDOR_RENEW_THRESHOLD) {
      try {
        const fresh = signVendorToken(decoded);
        await replaceSessionToken(email, token, fresh, req.user.staff || null);
        res.setHeader("x-renew-jwt", fresh);
      } catch (e) {
        // non-fatal: if renewal fails, continue with current token
        // console.error("Vendor token renewal failed:", e.message);
      }
    }
  }

  next();
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
