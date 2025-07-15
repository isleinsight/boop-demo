const authenticateToken = require("../middleware/authMiddleware");
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
    type,
    on_assistance,
    vendor,
    student
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await client.query(
      `INSERT INTO users (email, password_hash, first_name, middle_name, last_name, role, type, on_assistance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [email, hashedPassword, first_name, middle_name || null, last_name, role, type, on_assistance]
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
        `INSERT INTO vendors (user_id, business_name, phone, category, approved, wallet_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, vendor.name, vendor.phone, vendor.category, vendor.approved === true, user.wallet_id]
      );
    }

    if (role === "student" && student) {
      const { school_name, grade_level, expiry_date } = student;
      if (!school_name || !expiry_date) {
        throw new Error("Missing required student fields");
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

// ✅ Get users (with autocomplete or pagination, now including deleted filter)
router.get("/", async (req, res) => {
  const { search, role, status, page, perPage } = req.query;
  const isAutocomplete = !page && !perPage;

  try {
    const values = [];
    const whereClauses = [];

    // 🧠 Soft-delete logic
    if (status === "deleted") {
      whereClauses.push("deleted_at IS NOT NULL");
    } else {
      whereClauses.push("deleted_at IS NULL");
    }

    if (search) {
      whereClauses.push(`(
        LOWER(first_name) LIKE $${values.length + 1} OR
        LOWER(last_name) LIKE $${values.length + 1} OR
        LOWER(email) LIKE $${values.length + 1}
      )`);
      values.push(`%${search.toLowerCase()}%`);
    }

    if (role) {
      whereClauses.push(`role = $${values.length + 1}`);
      values.push(role);
    }

    // ⛔ Skip adding "status = deleted" — it's not a real status in DB
    if (status && status !== "deleted") {
      whereClauses.push(`status = $${values.length + 1}`);
      values.push(status);
    }

    const whereSQL = `WHERE ${whereClauses.join(" AND ")}`;

    // 🔍 Autocomplete mode
    if (isAutocomplete) {
      const result = await pool.query(
        `SELECT id, first_name, last_name, email, wallet_id
         FROM users
         ${whereSQL}
         ORDER BY first_name ASC
         LIMIT 10`,
        values
      );
      return res.json(result.rows);
    }

    // 📦 Pagination logic
    const limit = parseInt(perPage) || 10;
    const offset = ((parseInt(page) || 1) - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM users
       ${whereSQL}
       ORDER BY first_name ASC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM users ${whereSQL}`,
      values
    );

    const totalUsers = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      users: result.rows,
      total: totalUsers,
      totalPages
    });

  } catch (err) {
    console.error("❌ Error in GET /api/users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// ✅ Update user
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const fields = ["first_name", "middle_name", "last_name", "email", "role", "type", "status", "on_assistance", "deleted_at"];
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

    if (req.body.status === "suspended" || req.body.status === "active") {
      await pool.query(`UPDATE wallets SET status = $1 WHERE user_id = $2`, [req.body.status, id]);
    }

    res.json({ message: "User updated" });
  } catch (err) {
    console.error("❌ Error updating user:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ✅ Delete user
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    await pool.query(`UPDATE wallets SET status = 'archived' WHERE user_id = $1`, [id]);
await pool.query(
  `UPDATE users
   SET deleted_at = NOW(), status = 'suspended'
   WHERE id = $1`,
  [id]
);
res.json({ message: "User soft-deleted" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});


// ✅ Restore user
router.patch("/:id/restore", async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ message: "Invalid user ID" });

  try {
    await pool.query(
      `UPDATE users SET deleted_at = NULL, status = 'active' WHERE id = $1`,
      [id]
    );

    // Optional: restore wallet too
    await pool.query(`UPDATE wallets SET status = 'active' WHERE user_id = $1`, [id]);

    res.json({ message: "User restored" });
  } catch (err) {
    console.error("❌ Error restoring user:", err);
    res.status(500).json({ message: "Restore failed" });
  }
});

// ✅ Get user by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const client = await pool.connect();
  try {
    const userRes = await client.query("SELECT * FROM users WHERE id = $1", [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];

    if (user.role === "student") {
      const studentRes = await client.query("SELECT * FROM students WHERE user_id = $1", [user.id]);
      user.student_profile = studentRes.rows[0] || null;

      const parentRes = await client.query(`
        SELECT u.id, u.first_name, u.last_name, u.email
        FROM student_parents sp
        JOIN users u ON sp.parent_id = u.id
        WHERE sp.student_id = $1
      `, [user.id]);

      user.assigned_parents = parentRes.rows;
    }

    if (user.role === "parent") {
      const studentsRes = await client.query(`
        SELECT u.id, u.first_name, u.last_name, u.email
        FROM student_parents sp
        JOIN users u ON sp.student_id = u.id
        WHERE sp.parent_id = $1
      `, [user.id]);
      user.assigned_students = studentsRes.rows;
    }

    res.json(user);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  } finally {
    client.release();
  }
});

router.post("/:id/signout", async (req, res) => {
  res.json({ message: "Force sign-out not implemented yet" });
});

// ✅ Get current user info (used by /api/me)
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      console.warn("🛑 No user ID found in token payload.");
      return res.status(401).json({ message: "Not authenticated — missing user ID" });
    }

    const result = await pool.query(
      "SELECT id, email, role, type, first_name, last_name FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      console.warn("❌ User ID from token not found in DB:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];
    console.log("👤 Current user:", user.email, "| Role:", user.role);

    res.status(200).json(user);
  } catch (err) {
    console.error("🔥 Error in /me route:", err.message);
    res.status(500).json({ message: "Failed to fetch current user info" });
  }
});


module.exports = router;
