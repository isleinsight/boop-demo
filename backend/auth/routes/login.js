// backend/auth/routes/login.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../../db");

router.post("/", async (req, res) => {
  try {
    const emailInput = String(req.body?.email || "").trim().toLowerCase();
    const password   = String(req.body?.password || "");

    if (!emailInput || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // Look up user (case-insensitive)
    const { rows } = await pool.query(
      `SELECT id, email, role, type, status, first_name, last_name, password_hash
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [emailInput]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "No account found with that email." });

    // Status gate
    if (String(user.status || "").toLowerCase() === "suspended") {
      return res.status(403).json({ message: "This account has been suspended." });
    }

    // Password check
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) return res.status(401).json({ message: "Incorrect password." });

    // JWT with long TTL (minutes -> seconds)
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Server missing JWT secret" });

    const ACCESS_TTL_MIN = Number(process.env.JWT_VENDOR_ACCESS_TTL_MIN || 960); // 16h default
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role || "vendor",
      type: user.type || user.role || "vendor",
      first_name: user.first_name || null,
      last_name:  user.last_name  || null,
    };
    const token = jwt.sign(payload, secret, { expiresIn: ACCESS_TTL_MIN * 60 });

    // ---- Session policy: single OWNER session, many cashier sessions ----
    // Remove any prior owner (non-staff) sessions for this email.
    // (We only clear rows with NULL staff_id so cashier sessions remain.)
    await pool.query(
      `DELETE FROM sessions
        WHERE email = $1
          AND staff_id IS NULL`,
      [user.email]
    );

    // Insert fresh owner session (no upsert; no unique needed on email)
    await pool.query(
      `INSERT INTO sessions
         (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1,   $2,       NULL,     NULL,            NULL,               NOW())`,
      [user.email, token]
    );

    // Response
    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: payload.role,
        type: payload.type,
        first_name: user.first_name || null,
        last_name:  user.last_name  || null,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      },
    });
  } catch (err) {
    console.error("🔥 /auth/login error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
