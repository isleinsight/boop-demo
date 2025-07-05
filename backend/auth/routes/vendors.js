// backend/auth/routes/vendor.js

const express = require("express");
const router = express.Router();
const db = require("../../db");

// 🧠 Assumes the user already exists and has role 'vendor'
router.post("/", async (req, res) => {
  const {
    user_id,        // 👈 ID of the user that this vendor metadata belongs to
    business_name,
    category,
    phone,
    approved = false
  } = req.body;

  // 🔐 Validate required fields
  if (!user_id || !business_name || !category) {
    return res.status(400).json({ error: "Missing required fields: user_id, business_name, or category" });
  }

  try {
    // 🔎 Confirm the user exists and is a vendor
    const userCheck = await db.query(
      `SELECT * FROM users WHERE id = $1 AND role = 'vendor'`,
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "Vendor user not found or not a vendor role" });
    }

    // ✅ Insert vendor profile metadata
    const result = await db.query(
      `INSERT INTO vendors (user_id, business_name, category, phone, approved)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, business_name, category, phone, approved]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("❌ Vendor creation failed:", err);
    res.status(500).json({ error: "Failed to create vendor profile" });
  }
});


// GET: All vendors
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, u.email, u.first_name, u.last_name
       FROM vendors v
       JOIN users u ON v.user_id = u.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch vendors:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
