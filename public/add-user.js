// backend/auth/routes/users.js

const express = require("express");
const router = express.Router();
const db = require("../../db");
const bcrypt = require("bcrypt");

// Helper to check if wallet is needed
const shouldHaveWallet = (role) => {
  return ["cardholder", "student"].includes(role);
};

// POST /api/users
router.post("/", async (req, res) => {
  const { email, password, first_name, last_name, role, on_assistance = false, vendor } = req.body;

  if (!email || !password || !first_name || !last_name || !role) {
    return res.status(400).json({ error: "Missing required user fields" });
  }

  try {
    // ✅ 1. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ 2. Create user
    const userResult = await db.query(
      `INSERT INTO users (email, password, first_name, last_name, role, on_assistance)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [email, hashedPassword, first_name, last_name, role, on_assistance]
    );

    const userId = userResult.rows[0].id;

    // ✅ 3. If role is vendor, insert vendor record
    if (role === "vendor" && vendor) {
      await db.query(
        `INSERT INTO vendors (user_id, name, phone, category, approved)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, vendor.name, vendor.phone, vendor.category, vendor.approved]
      );
    }

    // ✅ 4. If role should have wallet, create one
    if (shouldHaveWallet(role)) {
      await db.query(
        `INSERT INTO wallets (user_id) VALUES ($1)`,
        [userId]
      );
    }

    res.status(201).json({ message: "User (and wallet if applicable) created successfully" });

  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

module.exports = router;
