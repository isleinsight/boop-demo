// backend/auth/routes/vendor-staff.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware"); // ← add this

const router = express.Router();

// 🔐 apply auth to everything below except /login
// (mount /login BEFORE .use(authenticateToken) so it stays public)
router.post("/login", async (req, res) => {
  try {
    const { vendor_email, username, password } = req.body || {};
    const email = String(vendor_email || "").trim().toLowerCase();
    const uname = String(username || "").trim();
    if (!email || !uname || !password) {
      return res.status(400).json({ message: "Missing vendor_email, username, or password" });
    }

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

    const sq = await pool.query(
      `SELECT id, vendor_id, username, display_name, password_hash, disabled, deleted_at
         FROM vendor_staff
        WHERE vendor_id = $1 AND username = $2
        LIMIT 1`,
      [vendorUser.id, uname]
    );
    const staff = sq.rows[0];
    if (!staff || staff.deleted_at) return res.status(404).json({ message: "Staff user not found" });
    if (staff.disabled) return res.status(403).json({ message: "Staff user disabled" });

    const ok = await bcrypt.compare(password, staff.password_hash || "");
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ message: "Server missing JWT secret" });
    const vendorExpSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200);

    const payload = {
      id: vendorUser.id,
      email: vendorUser.email,
      role: vendorUser.role || "vendor",
      type: vendorUser.type || "vendor",
      first_name: vendorUser.first_name || null,
      last_name: vendorUser.last_name || null,
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: vendorExpSeconds });

    await pool.query(
      `INSERT INTO sessions (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [vendorUser.email, token, staff.id, staff.username, staff.display_name || null]
    );

    return res.status(200).json({
      token,
      user: {
        id: vendorUser.id,
        email: vendorUser.email,
        role: "vendor",
        type: vendorUser.type || "vendor",
        first_name: vendorUser.first_name || null,
        last_name: vendorUser.last_name || null,
        staff: { id: staff.id, username: staff.username, display_name: staff.display_name || null },
      },
    });
  } catch (err) {
    console.error("[vendor-staff login] error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
});

// ⬇️ everything after this line requires a valid JWT
router.use(authenticateToken);

/**
 * GET /api/vendor/vendorstaff
 * List staff for the authenticated vendor
 */
router.get("/", async (req, res) => {
  try {
    if (!req.user || String(req.user.role).toLowerCase() !== "vendor") {
      return res.status(403).json({ message: "Only vendors can view staff" });
    }
    const { rows } = await pool.query(
      `SELECT id, username, display_name, disabled, created_at
         FROM vendor_staff
        WHERE vendor_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ staff: rows });
  } catch (err) {
    console.error("[vendor-staff GET] error:", err);
    res.status(500).json({ message: "Failed to load staff" });
  }
});

module.exports = router;
