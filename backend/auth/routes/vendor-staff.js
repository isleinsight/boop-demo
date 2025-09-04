// backend/auth/routes/vendor-staff.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../../db");

const router = express.Router();

/**
 * POST /auth/vendor-staff/login
 * Body: { vendor_email, username, password }
 *
 * - Authenticates a staff user that belongs to a VENDOR.
 * - Issues a normal vendor JWT (so the app behaves as the vendor),
 * - but writes staff context into the sessions row (so middleware adds req.user.staff).
 */
router.post("/login", async (req, res) => {
  try {
    const { vendor_email, username, password } = req.body || {};

    // Basic input checks
    const email = String(vendor_email || "").trim().toLowerCase();
    const uname = String(username || "").trim();

    if (!email || !uname || !password) {
      return res.status(400).json({ message: "Missing vendor_email, username, or password" });
    }

    // 1) Find vendor user
    const vq = await pool.query(
      `SELECT id, email, role, type, status, first_name, last_name
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [email]
    );
    const vendorUser = vq.rows[0];

    if (!vendorUser || String(vendorUser.role).toLowerCase() !== "vendor") {
      return res.status(404).json({ message: "Vendor account not found" });
    }
    if (vendorUser.status && String(vendorUser.status).toLowerCase() !== "active") {
      return res.status(403).json({ message: "Vendor account is not active" });
    }

    // 2) Find staff under this vendor
    const sq = await pool.query(
      `SELECT id, vendor_id, username, display_name, password_hash, disabled, deleted_at
         FROM vendor_staff
        WHERE vendor_id = $1
          AND username = $2
        LIMIT 1`,
      [vendorUser.id, uname]
    );
    const staff = sq.rows[0];
    if (!staff || staff.deleted_at) {
      return res.status(404).json({ message: "Staff user not found" });
    }
    if (staff.disabled) {
      return res.status(403).json({ message: "Staff user disabled" });
    }

    // 3) Verify password
    const ok = await bcrypt.compare(password, staff.password_hash || "");
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // 4) Build vendor JWT (acts as vendor; carries staff in the session)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ message: "Server missing JWT secret" });
    }

    // Expiry: use vendor override if set, else default to 12h (43200s)
    const vendorExpSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200); // 12 hours

    const payload = {
      id: vendorUser.id,
      email: vendorUser.email,
      role: vendorUser.role || "vendor",
      type: vendorUser.type || "vendor",
      first_name: vendorUser.first_name || null,
      last_name: vendorUser.last_name || null,
      // NOTE: we do NOT embed full staff info in the JWT (keeps token small/private).
      // The middleware will attach staff context from the sessions row.
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: vendorExpSeconds });

    // 5) Record session with staff context (this is what Step 2 middleware reads)
    await pool.query(
      `INSERT INTO sessions (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [vendorUser.email, token, staff.id, staff.username, staff.display_name || null]
    );

    // 6) Response mirrors your normal login shape; includes minimal staff echo
    return res.status(200).json({
      token,
      user: {
        id: vendorUser.id,
        email: vendorUser.email,
        role: "vendor",
        type: vendorUser.type || "vendor",
        first_name: vendorUser.first_name || null,
        last_name: vendorUser.last_name || null,
        staff: {
          id: staff.id,
          username: staff.username,
          display_name: staff.display_name || null,
        },
      },
    });
  } catch (err) {
    console.error("[vendor-staff login] error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
});

module.exports = router;
