// backend/auth/routes/vendor-staff.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */
function requireVendor(req, res) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role !== "vendor") {
    res.status(403).json({ message: "Only vendors can perform this action" });
    return false;
  }
  return true;
}

/* -------------------------------------------------------
   GET /api/vendor/vendorstaff
   List staff for the signed-in vendor
------------------------------------------------------- */
router.get("/vendorstaff", authenticateToken, async (req, res) => {
  try {
    if (!requireVendor(req, res)) return;

    const vendorUserId = req.user.id || req.user.userId;
    const { rows } = await pool.query(
      `SELECT
         id,
         display_name AS name,
         username     AS email,
         is_active
       FROM vendor_staff
       WHERE vendor_user_id = $1
       ORDER BY display_name ASC NULLS LAST, username ASC`,
      [vendorUserId]
    );

    res.json(rows);
  } catch (e) {
    console.error("[vendor-staff GET] error:", e);
    res.status(500).json({ message: "Failed to load staff" });
  }
});

/* -------------------------------------------------------
   POST /api/vendor/vendorstaff
   Body: { name, email, password }
------------------------------------------------------- */
router.post("/vendorstaff", authenticateToken, async (req, res) => {
  try {
    if (!requireVendor(req, res)) return;

    const vendorUserId = req.user.id || req.user.userId;
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO vendor_staff
         (vendor_user_id, username, display_name, password_hash, is_active, permissions, created_at)
       VALUES
         ($1, $2, $3, $4, true, '{}'::jsonb, NOW())
       RETURNING id, display_name AS name, username AS email, is_active`,
      [vendorUserId, email, name, hash]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    // Handle unique username per vendor violation nicely
    if (String(e?.code) === "23505") {
      return res.status(409).json({ message: "A staff account with that email already exists" });
    }
    console.error("[vendor-staff POST] error:", e);
    res.status(500).json({ message: "Failed to create staff" });
  }
});

/* -------------------------------------------------------
   PATCH /api/vendor/vendorstaff/:id
   Body: { name?, email?, password? }
------------------------------------------------------- */
router.patch("/vendorstaff/:id", authenticateToken, async (req, res) => {
  try {
    if (!requireVendor(req, res)) return;

    const vendorUserId = req.user.id || req.user.userId;
    const id = String(req.params.id);

    const name = (req.body?.name ?? null);
    const email = (req.body?.email ?? null);
    const password = (req.body?.password ?? null);

    // Build dynamic update
    const sets = [];
    const vals = [];
    let i = 1;

    if (name !== null)   { sets.push(`display_name = $${i++}`); vals.push(String(name).trim()); }
    if (email !== null)  { sets.push(`username     = $${i++}`); vals.push(String(email).trim().toLowerCase()); }
    if (password) {
      const hash = await bcrypt.hash(String(password), 10);
      sets.push(`password_hash = $${i++}`); vals.push(hash);
    }

    if (!sets.length) return res.status(400).json({ message: "Nothing to update" });

    vals.push(vendorUserId, id);

    const { rows } = await pool.query(
      `UPDATE vendor_staff
          SET ${sets.join(", ") }
        WHERE vendor_user_id = $${i++}
          AND id = $${i}
        RETURNING id, display_name AS name, username AS email, is_active`,
      vals
    );

    if (!rows.length) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    if (String(e?.code) === "23505") {
      return res.status(409).json({ message: "A staff account with that email already exists" });
    }
    console.error("[vendor-staff PATCH] error:", e);
    res.status(500).json({ message: "Failed to update staff" });
  }
});

/* -------------------------------------------------------
   DELETE /api/vendor/vendorstaff/:id
   (Hard delete; switch to soft delete if you prefer)
------------------------------------------------------- */
router.delete("/vendorstaff/:id", authenticateToken, async (req, res) => {
  try {
    if (!requireVendor(req, res)) return;

    const vendorUserId = req.user.id || req.user.userId;
    const id = String(req.params.id);

    const { rowCount } = await pool.query(
      `DELETE FROM vendor_staff
        WHERE vendor_user_id = $1
          AND id = $2`,
      [vendorUserId, id]
    );

    if (!rowCount) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[vendor-staff DELETE] error:", e);
    res.status(500).json({ message: "Failed to delete staff" });
  }
});

/* -------------------------------------------------------
   POST /auth/vendor-staff/login
   Body: { vendor_email, username?, email?, password }
   (username/email are synonyms; we use vendor_staff.username as the login id)
------------------------------------------------------- */
router.post("/login", async (req, res) => {
  try {
    const vendorEmail = String(req.body?.vendor_email || "").trim().toLowerCase();
    const staffLogin  = String((req.body?.username ?? req.body?.email ?? "")).trim().toLowerCase();
    const password    = String(req.body?.password || "");

    if (!vendorEmail || !staffLogin || !password) {
      return res.status(400).json({ message: "Missing vendor_email, username/email, or password" });
    }

    // Find vendor user
    const vq = await pool.query(
      `SELECT id, email, role, type, first_name, last_name
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [vendorEmail]
    );
    const vendorUser = vq.rows[0];
    if (!vendorUser || String(vendorUser.role).toLowerCase() !== "vendor") {
      return res.status(404).json({ message: "Vendor account not found" });
    }

    // Find staff under that vendor (username = staff email/user id)
    const sq = await pool.query(
      `SELECT id, vendor_user_id, username, display_name, password_hash, is_active
         FROM vendor_staff
        WHERE vendor_user_id = $1
          AND username = $2
        LIMIT 1`,
      [vendorUser.id, staffLogin]
    );
    const staff = sq.rows[0];
    if (!staff) return res.status(404).json({ message: "Staff user not found" });
    if (!staff.is_active) return res.status(403).json({ message: "Staff user disabled" });

    const ok = await bcrypt.compare(password, staff.password_hash || "");
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const jwtSecret = process.env.JWT_SECRET;
    const vendorExpSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200); // 12h default
    if (!jwtSecret) return res.status(500).json({ message: "Server missing JWT secret" });

    const payload = {
      id: vendorUser.id,
      email: vendorUser.email,
      role: vendorUser.role || "vendor",
      type: vendorUser.type || "vendor",
      first_name: vendorUser.first_name || null,
      last_name: vendorUser.last_name || null
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: vendorExpSeconds });

    await pool.query(
      `INSERT INTO sessions (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [vendorUser.email, token, staff.id, staff.username, staff.display_name || null]
    );

    res.json({
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
          username: staff.username,          // this is the “email” you typed
          display_name: staff.display_name || null
        }
      }
    });
  } catch (err) {
    console.error("[vendor-staff login] error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

module.exports = router;
