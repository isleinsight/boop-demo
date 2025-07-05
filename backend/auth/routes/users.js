// backend/auth/routes/users.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcrypt");

const rolesWithWallet = ["cardholder", "student", "senior"];

router.post("/", async (req, res) => {
  const {
    email,
    password,
    first_name,
    last_name,
    role,
    on_assistance,
    vendor,
  } = req.body;

  try {
    console.log("🧪 Creating user:", {
      email,
      first_name,
      last_name,
      role,
      on_assistance,
      vendor,
    });

    const hashedPassword = await bcrypt.hash(password, 12);

    const userInsert = await pool.query(
      `INSERT INTO users (
        email,
        password_hash,
        first_name,
        last_name,
        role,
        on_assistance
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [email, hashedPassword, first_name, last_name, role, on_assistance]
    );

    const user = userInsert.rows[0];

    // Auto-create wallet for eligible roles
    if (rolesWithWallet.includes(role)) {
      await pool.query(
        `INSERT INTO wallets (user_id, id)
         VALUES ($1, gen_random_uuid())`,
        [user.id]
      );
      console.log(`🎒 Wallet created for user ${user.id}`);
    }

    // Vendors also get wallets
    if (role === "vendor" && vendor) {
      await pool.query(
        `INSERT INTO vendors (
          id,
          business_name,
          phone,
          category,
          approved,
          wallet_id
        ) VALUES (
          $1, $2, $3, $4, $5, gen_random_uuid()
        )`,
        [
          user.id,
          vendor.name,
          vendor.phone,
          vendor.category,
          vendor.approved === true,
        ]
      );
      console.log(`🏪 Vendor created with wallet: ${user.id}`);
    }

    res.status(201).json({ message: "User created", user });
  } catch (err) {
    console.error("❌ Error creating user:", {
      message: err.message,
      stack: err.stack,
      detail: err.detail,
    });
    res.status(500).json({ message: "Failed to create user" });
  }
});

module.exports = router;
