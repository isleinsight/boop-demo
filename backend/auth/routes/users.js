const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcrypt");

const rolesWithWallet = ["cardholder", "student", "senior", "vendor"];

// ✅ POST /api/users — create user (+ wallet/vendor if needed)
router.post("/", async (req, res) => {
  const {
    email,
    password,
    first_name,
    middle_name, // ✅ ADDED
    last_name,
    role,
    on_assistance,
    vendor
  } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    // 1️⃣ Insert new user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, middle_name, last_name, role, on_assistance)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [email, hashedPassword, first_name, middle_name, last_name, role, on_assistance] // ✅ middle_name included
    );

    const user = result.rows[0];

    // 2️⃣ Create wallet if role qualifies
    if (rolesWithWallet.includes(role)) {
      const walletRes = await pool.query(
        `INSERT INTO wallets (user_id, id, status)
         VALUES ($1, gen_random_uuid(), 'active')
         RETURNING id`,
        [user.id]
      );

      const walletId = walletRes.rows[0].id;

      // Attach wallet ID to user
      await pool.query(
        `UPDATE users SET wallet_id = $1 WHERE id = $2`,
        [walletId, user.id]
      );

      user.wallet_id = walletId;

      // 3️⃣ If vendor, also create vendor record using valid wallet ID
      if (role === "vendor" && vendor) {
        await pool.query(
          `INSERT INTO vendors (id, business_name, phone, category, approved, wallet_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.id, vendor.name, vendor.phone, vendor.category, vendor.approved === true, walletId]
        );
      }
    }

    res.status(201).json({ message: "User created", id: user.id, role: user.role });

  } catch (err) {
    console.error("❌ Error creating user:", err);
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Failed to create user" });
  }
});

// ✅ GET /api/users
router.get("/", async (req, res) => {
  const { parentId, role, search, page = 1, eligibleOnly, hasWallet } = req.query;

  const isValidUUID = (str) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

  try {
    if (parentId) {
      if (!isValidUUID(parentId)) {
        return res.status(400).json({ message: "Invalid parentId" });
      }
      const result = await pool.query("SELECT * FROM users WHERE parent_id = $1", [parentId]);
      return res.json(result.rows);
    }

    if (search !== undefined) {
      const perPage = 10;
      const offset = (parseInt(page) - 1) * perPage;
      const term = `%${search.toLowerCase()}%`;

      let baseQuery = `SELECT * FROM users WHERE (
        LOWER(first_name) LIKE $1 OR
        LOWER(last_name) LIKE $1 OR
        LOWER(email) LIKE $1
      )`;

      const params = [term];

      if (eligibleOnly === "true") {
        baseQuery += ` AND role IN ('cardholder', 'student', 'senior')`;
      }

      if (hasWallet === "true") {
        baseQuery += ` AND id IN (SELECT user_id FROM wallets)`;
      }

      baseQuery += ` ORDER BY first_name ASC LIMIT $2 OFFSET $3`;
      params.push(perPage, offset);

      const result = await pool.query(baseQuery, params);
      return res.json(result.rows);
    }

    const result = await pool.query("SELECT * FROM users ORDER BY first_name ASC");
    res.json(result.rows);

  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ message: "Failed to process request" });
  }
});

// ✅ PATCH /api/users/:id — update user fields
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const fields = [
    "first_name",
    "middle_name", // ✅ ADDED
    "last_name",
    "email",
    "role",
    "status",
    "parent_id",
    "on_assistance"
  ];
  const updates = [];
  const values = [];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${updates.length + 1}`);
      values.push(req.body[field]);
    }
  });

  if (updates.length === 0) {
    return res.status(400).json({ message: "No fields provided" });
  }

  try {
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length + 1}`,
      [...values, id]
    );

    // 🔁 Sync wallet status if applicable
    if (req.body.status === "suspended" || req.body.status === "active") {
      await pool.query(
        `UPDATE wallets SET status = $1 WHERE user_id = $2`,
        [req.body.status, id]
      );
    }

    res.json({ message: "User updated" });

  } catch (err) {
    console.error("❌ Error updating user:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ✅ DELETE /api/users/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`UPDATE wallets SET status = 'archived' WHERE user_id = $1`, [id]);
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "User deleted" });

  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

// ✅ GET /api/users/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

// 🔌 Placeholder — Force logout route (optional)
router.post("/:id/signout", async (req, res) => {
  res.json({ message: "Force sign-out not implemented yet" });
});

module.exports = router;
