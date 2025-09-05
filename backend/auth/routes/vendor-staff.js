// backend/auth/routes/vendor-staff.js
const express = require("express");
const bcrypt = require("bcrypt");
const { authenticateToken } = require("../middleware/authMiddleware");
const pool = require("../../db");

const router = express.Router();

function requireVendor(req, res, next) {
  if (!req.user || String(req.user.role).toLowerCase() !== "vendor") {
    return res.status(403).json({ message: "Only vendors can access staff" });
  }
  next();
}

/* Normalize incoming fields from UI:
   UI sends { name, email, password }
   API-native may send { display_name, username, password, is_active }
*/
function normalizeBody(body = {}) {
  // prefer explicit API keys, fall back to UI keys
  const display_name = (body.display_name ?? body.name ?? "").trim();
  const username = (body.username ?? body.email ?? "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const is_active =
    typeof body.is_active === "boolean"
      ? body.is_active
      : (body.disabled === true ? false : undefined); // tolerate legacy "disabled"
  return { display_name, username, password, is_active };
}

/* -------------------------
   GET /api/vendor/vendorstaff
   List staff for this vendor
--------------------------*/
router.get("/vendorstaff", authenticateToken, requireVendor, async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { rows } = await pool.query(
      `SELECT id, username, display_name, is_active, last_login_at, created_at
         FROM vendor_staff
        WHERE vendor_user_id = $1
        ORDER BY created_at DESC`,
      [vendorId]
    );
    res.json(rows);
  } catch (e) {
    console.error("[vendor-staff GET] error:", e);
    res.status(500).json({ message: "Failed to load staff" });
  }
});

/* -------------------------
   POST /api/vendor/vendorstaff
   Body: { name, email, password }  (or { display_name, username, password })
--------------------------*/
router.post("/vendorstaff", authenticateToken, requireVendor, async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { display_name, username, password } = normalizeBody(req.body);

    if (!display_name || !username || !password) {
      return res
        .status(400)
        .json({ message: "Name, email (username), and password are required" });
    }

    // Uniqueness check
    const dup = await pool.query(
      `SELECT 1 FROM vendor_staff WHERE vendor_user_id = $1 AND username = $2 LIMIT 1`,
      [vendorId, username]
    );
    if (dup.rowCount) {
      return res.status(409).json({ message: "That email/username is already in use" });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO vendor_staff (vendor_user_id, username, display_name, password_hash, is_active, permissions)
       VALUES ($1, $2, $3, $4, true, '{}'::jsonb)
       RETURNING id, username, display_name, is_active, created_at`,
      [vendorId, username, display_name, hash]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error("[vendor-staff POST] error:", e);
    res.status(500).json({ message: "Failed to create staff" });
  }
});

/* -------------------------
   PATCH /api/vendor/vendorstaff/:id
   Body: any of { name/display_name, email/username, password, is_active }
--------------------------*/
router.patch(
  "/vendorstaff/:id",
  authenticateToken,
  requireVendor,
  async (req, res) => {
    try {
      const vendorId = req.user.id;
      const staffId = req.params.id;

      const { rows: existRows } = await pool.query(
        `SELECT id, username, display_name, is_active
           FROM vendor_staff
          WHERE id = $1 AND vendor_user_id = $2
          LIMIT 1`,
        [staffId, vendorId]
      );
      if (!existRows.length) {
        return res.status(404).json({ message: "Staff not found" });
      }
      const current = existRows[0];

      const { display_name, username, password, is_active } = normalizeBody(req.body);

      // Build dynamic update
      const sets = [];
      const params = [];
      let idx = 1;

      // If username is changing, check uniqueness
      if (username && username !== current.username) {
        const dup = await pool.query(
          `SELECT 1 FROM vendor_staff
            WHERE vendor_user_id = $1 AND username = $2 AND id <> $3 LIMIT 1`,
          [vendorId, username, staffId]
        );
        if (dup.rowCount) {
          return res.status(409).json({ message: "That email/username is already in use" });
        }
        sets.push(`username = $${idx++}`);
        params.push(username);
      }

      if (display_name && display_name !== current.display_name) {
        sets.push(`display_name = $${idx++}`);
        params.push(display_name);
      }

      if (typeof is_active === "boolean" && is_active !== current.is_active) {
        sets.push(`is_active = $${idx++}`);
        params.push(is_active);
      }

      if (password && password.trim().length) {
        const hash = await bcrypt.hash(password.trim(), 10);
        sets.push(`password_hash = $${idx++}`);
        params.push(hash);
      }

      if (!sets.length) {
        return res.json(current); // nothing to change
      }

      params.push(staffId, vendorId);
      const sql = `
        UPDATE vendor_staff
           SET ${sets.join(", ")},
               last_login_at = last_login_at
         WHERE id = $${idx++} AND vendor_user_id = $${idx++}
         RETURNING id, username, display_name, is_active, last_login_at, created_at
      `;

      const { rows } = await pool.query(sql, params);
      return res.json(rows[0]);
    } catch (e) {
      console.error("[vendor-staff PATCH] error:", e);
      res.status(500).json({ message: "Failed to update staff" });
    }
  }
);

/* -------------------------
   DELETE /api/vendor/vendorstaff/:id
   Soft delete (set is_active=false) or hard delete—choose soft here.
--------------------------*/
router.delete(
  "/vendorstaff/:id",
  authenticateToken,
  requireVendor,
  async (req, res) => {
    try {
      const vendorId = req.user.id;
      const staffId = req.params.id;

      const { rowCount } = await pool.query(
        `UPDATE vendor_staff
            SET is_active = false
          WHERE id = $1 AND vendor_user_id = $2`,
        [staffId, vendorId]
      );

      if (!rowCount) return res.status(404).json({ message: "Staff not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("[vendor-staff DELETE] error:", e);
      res.status(500).json({ message: "Failed to delete staff" });
    }
  }
);

/* -------------------------
   POST /auth/vendor-staff/login
   Body: { vendor_email, username, password }
   Issues a vendor JWT; stores staff context in sessions.
--------------------------*/
router.post("/login", async (req, res) => {
  try {
    const { vendor_email, username, password } = req.body || {};
    const email = String(vendor_email || "").trim().toLowerCase();
    const uname = String(username || "").trim().toLowerCase();

    if (!email || !uname || !password) {
      return res
        .status(400)
        .json({ message: "Missing vendor_email, username, or password" });
    }

    // Find vendor user
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

    // Find staff under vendor
    const sq = await pool.query(
      `SELECT id, vendor_user_id, username, display_name, password_hash, is_active
         FROM vendor_staff
        WHERE vendor_user_id = $1 AND username = $2
        LIMIT 1`,
      [vendorUser.id, uname]
    );
    const staff = sq.rows[0];
    if (!staff) return res.status(404).json({ message: "Staff user not found" });
    if (!staff.is_active) return res.status(403).json({ message: "Staff user disabled" });

    const ok = await bcrypt.compare(password, staff.password_hash || "");
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // Sign vendor JWT (long-lived handled by middleware)
    const jwtSecret = process.env.JWT_SECRET;
    const vendorExpSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200);

    const payload = {
      id: vendorUser.id,
      email: vendorUser.email,
      role: vendorUser.role || "vendor",
      type: vendorUser.type || "vendor",
      first_name: vendorUser.first_name || null,
      last_name: vendorUser.last_name || null,
    };

    const token = require("jsonwebtoken").sign(payload, jwtSecret, {
      expiresIn: vendorExpSeconds,
    });

    // record session with staff context
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
          username: staff.username,
          display_name: staff.display_name || null,
        },
      },
    });
  } catch (err) {
    console.error("[vendor-staff login] error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

module.exports = router;
