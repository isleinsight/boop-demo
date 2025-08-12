const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcrypt");

const {
  authenticateToken
} = require("../middleware/authMiddleware"); // ✅ THIS IS THE FIX

const crypto = require("crypto");

function generateTempPassword(len = 24) {
  return crypto.randomBytes(len).toString('base64url'); // strong, unguessable password
}

// Postmark setup
const { ServerClient } = require("postmark");
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || "";
const APP_URL = (process.env.APP_URL || "https://boopcard.com").replace(/\/+$/, "");
const FROM_EMAIL = process.env.SENDER_EMAIL || "davon.campbell@boopcard.com";
const postmark = POSTMARK_TOKEN ? new ServerClient(POSTMARK_TOKEN) : null;

const TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TTL_MIN || 30);

// helpers
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}
function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
async function sendResetEmail(to, link) {
  if (!postmark) {
    console.warn("[email] Postmark token missing; link:", link);
    return;
  }
  await postmark.sendEmail({
    From: FROM_EMAIL,
    To: to,
    Subject: "Reset your BOOP password",
    HtmlBody: `
      <p>Hello,</p>
      <p>Your BOOP account was created. Please set your password using the link below:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in ${TOKEN_TTL_MIN} minutes.</p>
    `,
    MessageStream: "outbound",
  });
}

const logAdminAction = require("../middleware/log-admin-action");

const rolesWithWallet = ["cardholder", "student", "senior", "vendor", "parent"];
const isValidUUID = (str) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

// ✅ Create user
router.post("/", authenticateToken, async (req, res) => {
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

const tempPw = password || generateTempPassword(24);
const hashedPassword = await bcrypt.hash(tempPw, 12);
  const result = await client.query(
    `INSERT INTO users (
       email, password_hash, first_name, middle_name, last_name, role, type, on_assistance
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [email, hashedPassword, first_name, middle_name || null, last_name, role, type, on_assistance]
  );

  const user = result.rows[0];

  // 💳 Wallet
  if (rolesWithWallet.includes(role)) {
    const walletRes = await client.query(
  `INSERT INTO wallets (user_id, id)
   VALUES ($1, gen_random_uuid())
   RETURNING id`,
  [user.id]
);
    const walletId = walletRes.rows[0].id;
    await client.query(
      `UPDATE users SET wallet_id = $1 WHERE id = $2`,
      [walletId, user.id]
    );
    user.wallet_id = walletId;
  }

  // 🏢 Vendor
  if (role === "vendor" && vendor) {
    await client.query(
      `INSERT INTO vendors (user_id, business_name, phone, category, approved, wallet_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, vendor.name, vendor.phone, vendor.category, vendor.approved === true, user.wallet_id]
    );
  }

  // 🎓 Student
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

  // ✅ Log admin action
  await logAdminAction({
    performed_by: req.user.id,
    action: "create_user",
    target_user_id: user.id,
    new_email: user.email,
    type: req.user.type,
    status: "completed",
    completed_at: new Date()
  });

  // Create a password reset token and send reset email
try {
  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

  await client.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  const link = `${APP_URL}/reset-password.html?token=${raw}`;
  await sendResetEmail(user.email, link);
} catch (e) {
  // Don't fail the whole request if email sends fail
  console.warn("password reset email/initiation failed:", e.message);
}

  await client.query("COMMIT");

  res.status(201).json({
    message: "User created",
    id: user.id,
    role: user.role
  });

} catch (err) {
  await client.query("ROLLBACK");
  console.error("❌ Error creating user:", err);

  await logAdminAction({
    performed_by: req.user.id,
    action: "create_user",
    target_user_id: null,
    new_email: email,
    type: req.user.type,
    status: "failed",
    error_message: err.message
  });

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
  const { search, role, status, page, perPage, assistanceOnly, type, canReceiveCard, hasWallet, sortBy = 'first_name', sortDirection = 'asc' } = req.query;
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

    if (canReceiveCard && canReceiveCard.toLowerCase() === 'true') {
      whereClauses.push("can_receive_card IS TRUE");
    }

    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      const idx = values.length;
      whereClauses.push(`(
        LOWER(first_name) LIKE $${idx} OR
        LOWER(last_name) LIKE $${idx} OR
        LOWER(email) LIKE $${idx}
      )`);
    }

    if (role) {
      values.push(role);
      whereClauses.push(`role = $${values.length}`);
    }

    if (type) {
      values.push(type);
      whereClauses.push(`type = $${values.length}`);
    }

    if (assistanceOnly === 'true') {
      whereClauses.push("on_assistance = true");
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Validate sortBy to prevent SQL injection
    const validSortColumns = ['first_name', 'last_name', 'email'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'first_name';
    const sortDir = sortDirection === 'desc' ? 'DESC' : 'ASC';

    // 🔍 Autocomplete mode
    if (isAutocomplete) {
      const result = await pool.query(
        `SELECT id, first_name, last_name, email, wallet_id
         FROM users
         ${whereSQL}
         ORDER BY ${sortColumn} ${sortDir}
         LIMIT 10`,
        values
      );
      return res.json(result.rows);
    }

    // 📦 Pagination mode
    const limit = parseInt(perPage) || 10;
    const offset = ((parseInt(page) || 1) - 1) * limit;

    const result = await pool.query(
      `SELECT *
       FROM users
       ${whereSQL}
       ORDER BY ${sortColumn} ${sortDir}
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

// ✅ Update user (with suspend/unsuspend tracking)
router.patch("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const fields = [
    "first_name",
    "middle_name",
    "last_name",
    "email",
    "role",
    "type",
    "status",
    "on_assistance",
    "deleted_at",
    "performed_by"
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
    // 💾 Update the user
    values.push(id);
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length}`,
      values
    );

    // 🧾 Admin action logging
    const baseLog = {
      performed_by: req.user.id,
      target_user_id: id,
      type: req.user.type,
      status: "completed",
      completed_at: new Date()
    };

    if (req.body.status === "suspended" || req.body.status === "active") {
      

      const actionLabel = req.body.status === "suspended" ? "suspend" : "unsuspend";

      await logAdminAction({
        ...baseLog,
        action: actionLabel
      });
    } else {
      await logAdminAction({
        ...baseLog,
        action: "update"
      });
    }

    res.json({ message: "User updated" });
  } catch (err) {
    console.error("❌ Error updating user:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ✅ Delete user (soft-delete)
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {

    await pool.query(
      `UPDATE users SET deleted_at = NOW(), status = 'suspended' WHERE id = $1`,
      [id]
    );

    await logAdminAction({
      performed_by: req.user.id,
      action: "delete",
      target_user_id: id,
      type: req.user.type,
      status: "completed",
      completed_at: new Date()
    });

    res.json({ message: "User soft-deleted" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

// ✅ Restore user
router.patch("/:id/restore", authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    await pool.query(
      `UPDATE users SET deleted_at = NULL, status = 'active' WHERE id = $1`,
      [id]
    );


    await logAdminAction({
      performed_by: req.user.id,
      action: "restore",
      target_user_id: id,
      type: req.user.type,
      status: "completed",
      completed_at: new Date()
    });

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
        SELECT u.id, u.first_name, u.last_name, u.email,
               s.school_name, s.grade_level, s.expiry_date
        FROM student_parents sp
        JOIN users u ON sp.student_id = u.id
        LEFT JOIN students s ON u.id = s.user_id
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

// ✅ POST /api/users/:id/signout
router.post("/:id/signout", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch the user's email
    const userRes = await pool.query(`SELECT email FROM users WHERE id = $1`, [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const { email } = userRes.rows[0];

    // 2. Set force_signed_out = true
    await pool.query(`UPDATE users SET force_signed_out = true WHERE id = $1`, [id]);

    // 3. Delete their session if it exists
    try {
      await pool.query(`DELETE FROM sessions WHERE email = $1`, [email]);
    } catch (err) {
      console.warn("⚠️ Could not delete session for signout:", err.message);
    }

    // 4. Log admin action
    await logAdminAction({
      performed_by: req.user.id,
      action: "signout",
      target_user_id: id,
      type: req.user.type,
      status: "completed",
      completed_at: new Date()
    });

    res.status(200).json({ message: "User has been force signed out." });
  } catch (err) {
    console.error("❌ Failed to sign out user:", err);
    res.status(500).json({ message: "Failed to force sign-out" });
  }
});

// ✅ GET /api/users/me — Get current user info
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user && req.user.id;

    if (!userId) {
      console.warn("🛑 No user ID found in token payload.");
      return res.status(401).json({ message: "Not authenticated — missing user ID" });
    }

    const result = await pool.query(
      `SELECT id, email, role, type, first_name, last_name, force_signed_out
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      console.warn("❌ User ID from token not found in DB:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("🔥 Error in /me route:", err.message);
    res.status(500).json({ message: "Failed to fetch current user info" });
  }
});


module.exports = router;
