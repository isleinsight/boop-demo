const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcrypt");

const rolesWithWallet = ["cardholder", "student", "senior", "vendor"];
const isValidUUID = (str) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

// ✅ Create user
router.post("/", async (req, res) => {
  const {
    email,
    password,
    first_name,
    middle_name,
    last_name,
    role,
    on_assistance,
    vendor,
    student // 🎯 expect { school_name, grade_level, expiry_date }
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await client.query(
      `INSERT INTO users (email, password_hash, first_name, middle_name, last_name, role, on_assistance)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [email, hashedPassword, first_name, middle_name || null, last_name, role, on_assistance]
    );

    const user = result.rows[0];

    if (rolesWithWallet.includes(role)) {
      const walletRes = await client.query(
        `INSERT INTO wallets (user_id, id, status)
         VALUES ($1, gen_random_uuid(), 'active')
         RETURNING id`,
        [user.id]
      );

      const walletId = walletRes.rows[0].id;
      await client.query(`UPDATE users SET wallet_id = $1 WHERE id = $2`, [walletId, user.id]);
      user.wallet_id = walletId;
    }

    if (role === "vendor" && vendor) {
      await client.query(
        `INSERT INTO vendors (id, business_name, phone, category, approved, wallet_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.id,
          vendor.name,
          vendor.phone,
          vendor.category,
          vendor.approved === true,
          user.wallet_id,
        ]
      );
    }

    // ✅ Add student record if role is student
    if (role === "student" && student) {
      const { school_name, grade_level, expiry_date } = student;

      if (!school_name || !expiry_date) {
        throw new Error("Missing required student fields (school_name, expiry_date)");
      }

      await client.query(
        `INSERT INTO students (user_id, school_name, grade_level, expiry_date)
         VALUES ($1, $2, $3, $4)`,
        [user.id, school_name, grade_level || null, expiry_date]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({ message: "User created", id: user.id, role: user.role });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error creating user:", err);
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Failed to create user" });
  } finally {
    client.release();
  }
});

// The rest of your GET, PATCH, DELETE routes are unchanged and can remain as-is.
