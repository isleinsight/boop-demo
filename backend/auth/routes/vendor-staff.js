// backend/auth/routes/vendor-staff.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * POST /auth/vendor-staff/login
 * Body: { vendor_email, username, password }
 *
 * Authenticates a cashier/staff that belongs to a *vendor* user.
 * Issues a normal vendor JWT (so the app behaves as that vendor)
 * and records staff context in sessions for auditing.
 */
router.post("/login", async (req, res) => {
  try {
    const { vendor_email, username, password } = req.body || {};

    const email = String(vendor_email || "").trim().toLowerCase();
    const uname = String(username || "").trim();

    if (!email || !uname || !password) {
      return res
        .status(400)
        .json({ message: "Missing vendor_email, username, or password" });
    }

    // 1) Find the vendor user
    const vq = await pool.query(
      `SELECT id, email, role, type, first_name, last_name
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [email]
    );
    const vendorUser = vq.rows[0];
    if (!vendorUser || String(vendorUser.role).toLowerCase() !== "vendor") {
      return res.status(404).json({ message: "Vendor account not found" });
    }

    // 2) Find staff under this vendor
    const sq = await pool.query(
      `SELECT id, vendor_user_id, username, display_name, password_hash, is_active
         FROM vendor_staff
        WHERE vendor_user_id = $1
          AND username = $2
        LIMIT 1`,
      [vendorUser.id, uname]
    );
    const staff = sq.rows[0];
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    if (!staff.is_active)
      return res.status(403).json({ message: "Staff account is inactive" });

    // 3) Verify password
    const ok = await bcrypt.compare(password, staff.password_hash || "");
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // 4) Build vendor JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ message: "Server missing JWT secret" });
    }
    const vendorExpSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200); // 12h

    const payload = {
      id: vendorUser.id,
      email: vendorUser.email,
      role: vendorUser.role || "vendor",
      type: vendorUser.type || "vendor",
      first_name: vendorUser.first_name || null,
      last_name: vendorUser.last_name || null,
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: vendorExpSeconds });

    // 5) Record session with staff context
    await pool.query(
      `INSERT INTO sessions (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [vendorUser.email, token, staff.id, staff.username, staff.display_name || null]
    );

    // Optionally record last_login_at for staff
    await pool.query(
      `UPDATE vendor_staff SET last_login_at = NOW() WHERE id = $1`,
      [staff.id]
    );

    // 6) Respond
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

/* -------------------- CRUD (vendor-managed) -------------------- */
/* Base path mounted in server.js as:
 *   mount('/api/vendor/vendorstaff', './auth/routes/vendor-staff', 'vendor-staff (CRUD)')
 * All below require a signed-in vendor JWT.
 */

// List staff for current vendor
router.get("/", authenticateToken, async (req, res) => {
  try {
    const me = req.user || {};
    if (String(me.role).toLowerCase() !== "vendor") {
      return res.status(403).json({ message: "Only vendors can view staff" });
    }

    const { rows } = await pool.query(
      `SELECT id, username, display_name, is_active, permissions, last_login_at, created_at
         FROM vendor_staff
        WHERE vendor_user_id = $1
        ORDER BY created_at DESC`,
      [me.id || me.userId]
    );

    // Always return an array (even if empty)
    return res.json(rows);
  } catch (err) {
    console.error("[vendor-staff GET] error:", err);
    return res.status(500).json({ message: "Failed to load staff" });
  }
});

// Create staff
router.post("/", authenticateToken, async (req, res) => {
  try {
    const me = req.user || {};
    if (String(me.role).toLowerCase() !== "vendor") {
      return res.status(403).json({ message: "Only vendors can create staff" });
    }

    // UI sends: { name, email, password }
    const name = String(req.body?.name || "").trim();
    const emailAsUsername = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");

    if (!name || !emailAsUsername || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required" });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO vendor_staff (id, vendor_user_id, username, display_name, password_hash, is_active, permissions, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, TRUE, '{}'::jsonb, NOW())
       RETURNING id, username, display_name, is_active, permissions, created_at`,
      [me.id || me.userId, emailAsUsername, name, hash]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    // likely uniqueness violation on (vendor_user_id, username)
    console.error("[vendor-staff POST] error:", err);
    return res.status(500).json({ message: "Failed to create staff" });
  }
});

// Update staff
router.patch("/:id", authenticateToken, async (req, res) => {
  try {
    const me = req.user || {};
    if (String(me.role).toLowerCase() !== "vendor") {
      return res.status(403).json({ message: "Only vendors can update staff" });
    }

    const id = req.params.id;
    const name = req.body?.name;
    const emailAsUsername = req.body?.email;
    const password = req.body?.password;
    const isActive = req.body?.is_active;

    // Build dynamic update
    const sets = [];
    const vals = [];
    let idx = 1;

    if (typeof name === "string") {
      sets.push(`display_name = $${idx++}`);
      vals.push(name.trim());
    }
    if (typeof emailAsUsername === "string") {
      sets.push(`username = $${idx++}`);
      vals.push(emailAsUsername.trim());
    }
    if (typeof isActive === "boolean") {
      sets.push(`is_active = $${idx++}`);
      vals.push(isActive);
    }
    if (typeof password === "string" && password.trim()) {
      const hash = await bcrypt.hash(password.trim(), 10);
      sets.push(`password_hash = $${idx++}`);
      vals.push(hash);
    }

    if (!sets.length) {
      return res.status(400).json({ message: "No changes provided" });
    }

    // Ensure row belongs to this vendor
    vals.push(me.id || me.userId);
    vals.push(id);

    const { rows } = await pool.query(
      `UPDATE vendor_staff
          SET ${sets.join(", ") }
        WHERE vendor_user_id = $${idx++}
          AND id = $${idx++}
        RETURNING id, username, display_name, is_active, permissions, created_at`,
      vals
    );

    if (!rows.length) return res.status(404).json({ message: "Staff not found" });
    return res.json(rows[0]);
  } catch (err) {
    console.error("[vendor-staff PATCH] error:", err);
    return res.status(500).json({ message: "Failed to update staff" });
  }
});

// Delete staff (hard delete)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const me = req.user || {};
    if (String(me.role).toLowerCase() !== "vendor") {
      return res.status(403).json({ message: "Only vendors can delete staff" });
    }

    const id = req.params.id;
    const { rowCount } = await pool.query(
      `DELETE FROM vendor_staff
        WHERE vendor_user_id = $1
          AND id = $2`,
      [me.id || me.userId, id]
    );

    if (!rowCount) return res.status(404).json({ message: "Staff not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[vendor-staff DELETE] error:", err);
    return res.status(500).json({ message: "Failed to delete staff" });
  }
});

module.exports = router;
