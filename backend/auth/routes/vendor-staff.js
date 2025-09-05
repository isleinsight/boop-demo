// backend/auth/routes/vendor-staff.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

/* ───────────────────────────────────────────────────────────
   0) Health check (works on both mounts)
   - /auth/vendor-staff/ping
   - /api/vendor/vendorstaff/ping
─────────────────────────────────────────────────────────── */
router.get("/ping", (_req, res) => res.json({ ok: true, route: "vendor-staff" }));

/* ───────────────────────────────────────────────────────────
   1) STAFF LOGIN  (public)
   POST /auth/vendor-staff/login
   Body: { vendor_email, username, password }
   - Issues a VENDOR JWT (acts as vendor)
   - Saves staff context into the sessions row
─────────────────────────────────────────────────────────── */
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

    // Expiry: override if JWT_VENDOR_EXPIRES is set, else 12h
    const vendorExpSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200);

    const payload = {
      id: vendorUser.id,
      email: vendorUser.email,
      role: vendorUser.role || "vendor",
      type: vendorUser.type || "vendor",
      first_name: vendorUser.first_name || null,
      last_name: vendorUser.last_name || null
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: vendorExpSeconds });

    // 5) Record session with staff context (middleware can attach req.user.staff)
    await pool.query(
      `INSERT INTO sessions (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [vendorUser.email, token, staff.id, staff.username, staff.display_name || null]
    );

    // 6) Response
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
          display_name: staff.display_name || null
        }
      }
    });
  } catch (err) {
    console.error("[vendor-staff login] error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
});

/* ───────────────────────────────────────────────────────────
   Helpers + auth gate for CRUD endpoints
─────────────────────────────────────────────────────────── */
function vendorIdFromUser(user) {
  // Your JWT payload uses id/userId; pick what exists
  if (!user) return null;
  const role = String(user.role || "").toLowerCase();
  if (role !== "vendor") return null;
  return user.userId || user.id || null;
}

// Everything below here requires a valid vendor JWT
router.use(authenticateToken);

/* ───────────────────────────────────────────────────────────
   2) LIST STAFF (for signed-in vendor)
   GET /api/vendor/vendorstaff
─────────────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const vendorId = vendorIdFromUser(req.user);
    if (!vendorId) return res.status(403).json({ message: "Vendor only" });

    const { rows } = await pool.query(
      `SELECT id, username, display_name, disabled, created_at, updated_at
         FROM vendor_staff
        WHERE vendor_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [vendorId]
    );
    res.json({ staff: rows });
  } catch (e) {
    console.error("[vendor-staff list] error:", e);
    res.status(500).json({ message: "Failed to load staff" });
  }
});

/* ───────────────────────────────────────────────────────────
   3) CREATE STAFF
   POST /api/vendor/vendorstaff
   Body: { username, display_name, password, disabled? }
─────────────────────────────────────────────────────────── */
router.post("/", async (req, res) => {
  try {
    const vendorId = vendorIdFromUser(req.user);
    if (!vendorId) return res.status(403).json({ message: "Vendor only" });

    const { username, display_name, password, disabled = false } = req.body || {};
    const uname = String(username || "").trim();
    if (!uname || !password) {
      return res.status(400).json({ message: "username and password required" });
    }

    // Ensure username is unique per vendor
    const exists = await pool.query(
      `SELECT 1 FROM vendor_staff WHERE vendor_id = $1 AND username = $2 AND deleted_at IS NULL`,
      [vendorId, uname]
    );
    if (exists.rowCount) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const { rows } = await pool.query(
      `INSERT INTO vendor_staff (vendor_id, username, display_name, password_hash, disabled)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, display_name, disabled, created_at, updated_at`,
      [vendorId, uname, display_name || null, hash, !!disabled]
    );
    res.status(201).json({ staff: rows[0] });
  } catch (e) {
    console.error("[vendor-staff create] error:", e);
    res.status(500).json({ message: "Failed to create staff" });
  }
});

/* ───────────────────────────────────────────────────────────
   4) UPDATE STAFF
   PATCH /api/vendor/vendorstaff/:id
   Body: { username?, display_name?, password?, disabled? }
─────────────────────────────────────────────────────────── */
router.patch("/:id", async (req, res) => {
  try {
    const vendorId = vendorIdFromUser(req.user);
    if (!vendorId) return res.status(403).json({ message: "Vendor only" });

    const id = req.params.id;
    const { username, display_name, password, disabled } = req.body || {};

    // Ensure row belongs to this vendor
    const { rows: owner } = await pool.query(
      `SELECT id FROM vendor_staff WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`,
      [id, vendorId]
    );
    if (!owner.length) return res.status(404).json({ message: "Staff not found" });

    const sets = [];
    const vals = [id, vendorId];
    if (username != null) { sets.push(`username = $${vals.push(String(username).trim())}`); }
    if (display_name != null) { sets.push(`display_name = $${vals.push(display_name)}`); }
    if (typeof disabled === "boolean") { sets.push(`disabled = $${vals.push(disabled)}`); }
    if (password != null) {
      const hash = await bcrypt.hash(String(password), 10);
      sets.push(`password_hash = $${vals.push(hash)}`);
    }

    if (!sets.length) return res.json({ ok: true });

    const sql = `
      UPDATE vendor_staff
         SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $1 AND vendor_id = $2
       RETURNING id, username, display_name, disabled, created_at, updated_at`;
    const { rows } = await pool.query(sql, vals);
    res.json({ staff: rows[0] });
  } catch (e) {
    console.error("[vendor-staff update] error:", e);
    res.status(500).json({ message: "Failed to update staff" });
  }
});

/* ───────────────────────────────────────────────────────────
   5) DELETE STAFF (soft delete)
   DELETE /api/vendor/vendorstaff/:id
─────────────────────────────────────────────────────────── */
router.delete("/:id", async (req, res) => {
  try {
    const vendorId = vendorIdFromUser(req.user);
    if (!vendorId) return res.status(403).json({ message: "Vendor only" });

    const id = req.params.id;
    const { rowCount } = await pool.query(
      `UPDATE vendor_staff
          SET deleted_at = NOW()
        WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`,
      [id, vendorId]
    );
    if (!rowCount) return res.status(404).json({ message: "Staff not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[vendor-staff delete] error:", e);
    res.status(500).json({ message: "Failed to delete staff" });
  }
});

module.exports = router;
