// backend/auth/routes/login.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../../db");

router.post("/", async (req, res) => {
  try {
    const emailInput = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!emailInput || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // Fetch user (case-insensitive)
    const uq = await pool.query(
      `SELECT id, email, role, type, status, first_name, last_name, password_hash
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [emailInput]
    );
    const user = uq.rows[0];
    if (!user) return res.status(404).json({ message: "No account found with that email." });

    // Status gate
    if (String(user.status || "").toLowerCase() === "suspended") {
      return res.status(403).json({ message: "This account has been suspended." });
    }

    // Password check
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) return res.status(401).json({ message: "Incorrect password." });

    // JWT
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Server missing JWT secret" });

    const expSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200); // default 12h
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role || "vendor",
      type: user.type || user.role || "vendor",
      first_name: user.first_name || null,
      last_name: user.last_name || null,
    };
    const token = jwt.sign(payload, secret, { expiresIn: expSeconds });

    // Session UPSERT — match your actual columns and clear any staff context
    await pool.query(
      `INSERT INTO sessions (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1, $2, NULL, NULL, NULL, NOW())
       ON CONFLICT (email)
       DO UPDATE SET
         jwt_token = EXCLUDED.jwt_token,
         staff_id = NULL,
         staff_username = NULL,
         staff_display_name = NULL,
         created_at = NOW()`,
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
        last_name: user.last_name || null,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      },
    });
  } catch (err) {
    console.error("🔥 /auth/login error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
