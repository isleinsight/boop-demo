const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcrypt");
// ---- add near top (after imports) ------------------------------------------
const argon2 = require('argon2');
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 15360, timeCost: 2, parallelism: 1 };

function randHex(n = 16){ return require('crypto').randomBytes(n).toString('hex'); }
function passportId(){ return 'PID-' + randHex(12); }
function pidToken(){   return 'PTK-' + randHex(24); }
function cardUID(){    return 'CARD-' + randHex(12); }


const {
  authenticateToken
} = require("../middleware/authMiddleware"); 

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

// Guard: block acting on yourself, system users, or super_admin
async function guardProtectedUser(targetId, callerId) {
  if (String(targetId) === String(callerId)) {
    return { blocked: true, code: 400, message: "You cannot act on your own account." };
  }

  const { rows } = await pool.query(
    "SELECT role, type, is_system FROM users WHERE id = $1",
    [targetId]
  );
  if (!rows.length) {
    return { blocked: true, code: 404, message: "User not found" };
  }

  const u = rows[0];
  const isSuperAdmin =
    String(u.role).toLowerCase() === "admin" &&
    String(u.type).toLowerCase() === "super_admin";

  if (u.is_system || isSuperAdmin) {
    return { blocked: true, code: 403, message: "That account is protected." };
  }

  return { blocked: false };
}

// ✅ Create user (admin)
router.post("/", authenticateToken, async (req, res) => {
  const {
    email,
    password,                // optional; if omitted we generate a temp one & email reset link
    first_name,
    middle_name,
    last_name,
    role,
    type,
    on_assistance,
    vendor,
    student
  } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) hash password with Argon2id (safer)
    const tempPw = password || generateTempPassword(24);
    const password_hash = await argon2.hash(tempPw, ARGON_OPTS);

    // 2) create user (status active)
    const userIns = await client.query(
      `INSERT INTO users (
         email, password_hash, first_name, middle_name, last_name,
         role, type, on_assistance, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active')
       RETURNING *`,
      [email, password_hash, first_name, middle_name || null, last_name, role, type, !!on_assistance]
    );
    const user = userIns.rows[0];

    // 3) wallet (always create)
    const walletIns = await client.query(
      `INSERT INTO wallets (user_id, balance, is_treasury, is_merchant)
       VALUES ($1, 0, false, false)
       RETURNING id`,
      [user.id]
    );
    const walletId = walletIns.rows[0].id;
    await client.query(`UPDATE users SET wallet_id = $1 WHERE id = $2`, [walletId, user.id]);

    // 4) passport (always create)
    const ppid = passportId();
    const ptoken = pidToken();
    await client.query(
      `INSERT INTO passports (user_id, passport_id, pid_token)
       VALUES ($1,$2,$3)`,
      [user.id, ppid, ptoken]
    );
    await client.query(`UPDATE users SET passport_pid = $1 WHERE id = $2`, [ppid, user.id]);

    // 5) spending card (always create; issued_by = admin performing action)
    const uid = cardUID();
    const adminId = req.user?.id || req.user?.userId || null;
    await client.query(
      `INSERT INTO cards (wallet_id, type, status, issued_by, uid)
       VALUES ($1, 'spending', 'active', $2, $3)`,
      [walletId, adminId, uid]
    );

    // 6) optional: vendor profile
    if (role === "vendor" && vendor) {
      const businessName = (vendor.name || "").trim();
      const category     = (vendor.category || "").trim(); // free-text category
      const phone        = (vendor.phone || "").trim();
      const address      = (vendor.address || "").trim() || null;
      if (!businessName) throw new Error("Vendor business_name is required");
      if (!category)     throw new Error("Vendor category is required");

      await client.query(
        `INSERT INTO vendors (user_id, business_name, phone, category, address, wallet_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [user.id, businessName, phone, category, address, walletId]
      );
    }

    // 7) optional: student profile
    if (role === "student" && student) {
      const { school_name, grade_level, expiry_date } = student;
      if (!school_name || !expiry_date) {
        throw new Error("Missing required student fields");
      }
      await client.query(
        `INSERT INTO students (user_id, school_name, grade_level, expiry_date)
         VALUES ($1,$2,$3,$4)`,
        [user.id, school_name, grade_level || null, expiry_date]
      );
    }

    // 8) admin action log
    await logAdminAction({
      performed_by: req.user.id,
      action: "create_user",
      target_user_id: user.id,
      new_email: user.email,
      type: req.user.type,
      status: "completed",
      completed_at: new Date()
    });

    // 9) create reset token + send setup email (don’t fail whole request if email fails)
    try {
      const raw = generateToken();
      const tokenHash = hashToken(raw);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1,$2,$3)`,
        [user.id, tokenHash, expiresAt]
      );

      const link = `${APP_URL}/reset-password.html?token=${raw}`;
      await sendResetEmail(user.email, link);
    } catch (e) {
      console.warn("password reset email/initiation failed:", e.message);
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: "User created",
      id: user.id,
      wallet_id: walletId,
      passport_id: ppid,
      card_uid: uid,
      role: user.role,
      type: user.type
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
      // covers unique(email), unique(passport_id), unique(pid_token), unique(card uid)
      return res.status(400).json({ message: "A unique field already exists (email / passport / card UID)." });
    }
    return res.status(500).json({ message: "Failed to create user" });
  } finally {
    client.release();
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

// ✅ Get users (autocomplete or pagination) with role/type exclusion + hasWallet support
//    - Cardholders automatically cannot see Student/Parent results (unless include_household=true)
//    - Accepts exclude_roles=student,parent,admin (comma-separated). Applies to BOTH role and type.
//    - hasWallet=true will only return users that have a wallet.
router.get("/", authenticateToken, async (req, res) => {
  const {
    search,
    role,
    status,
    page,
    perPage,
    assistanceOnly,
    type,
    canReceiveCard,
    hasWallet,
    sortBy = "first_name",
    sortDirection = "asc",
    exclude_roles = "",
    include_household = "false",
  } = req.query;

  const isAutocomplete = !page && !perPage;

  try {
    const values = [];
    const where = [];
    let join = ""; // keep if you want later

    // Only show non-deleted by default
    if (status === "deleted") {
      where.push("u.deleted_at IS NOT NULL");
    } else {
      where.push("u.deleted_at IS NULL");
    }

    // Always hide system/placeholder users from list APIs
where.push("u.is_system = false");

    // Only active users (prevents suspended/etc. from showing in pickers)
    where.push("(u.status IS NULL OR LOWER(u.status) = 'active')");

    if (canReceiveCard && canReceiveCard.toLowerCase() === "true") {
      where.push("u.can_receive_card IS TRUE");
    }

    // Text search
    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      const i = values.length;
      where.push(`(
        LOWER(u.first_name) LIKE $${i} OR
        LOWER(u.last_name)  LIKE $${i} OR
        LOWER(u.email)      LIKE $${i}
      )`);
    }

    // Exact role/type if provided
    if (role) {
      values.push(role.toLowerCase());
      where.push(`LOWER(u.role) = $${values.length}`);
    }
    if (type) {
      values.push(type.toLowerCase());
      where.push(`LOWER(u.type) = $${values.length}`);
    }

    if (assistanceOnly === "true") {
      where.push("u.on_assistance = TRUE");
    }

    // ---- Exclusions --------------------------------------------------------
    // Roles that can NEVER be recipients in P2P
    const nonP2PRoles = ["admin", "accountant", "treasury", "staff", "support"];

    // Explicit excludes from query
    const explicitExcludes = exclude_roles
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    // If the requester is a cardholder, hide student/parent unless explicitly allowed
    const requesterRole = String(req.user?.role || "").toLowerCase();
    const requesterType = String(req.user?.type || "").toLowerCase();
    const isCardholderRequester =
      requesterRole === "cardholder" ||
      requesterType === "cardholder" ||
      requesterRole === "cardholder_assistance" ||
      requesterType === "cardholder_assistance";

    const allowHousehold = String(include_household).toLowerCase() === "true";
    const autoExcludes = isCardholderRequester && !allowHousehold ? ["student", "parent"] : [];

    const finalExcludes = Array.from(new Set([...nonP2PRoles, ...explicitExcludes, ...autoExcludes]));

    if (finalExcludes.length) {
      values.push(finalExcludes, finalExcludes);
      // Use COALESCE so NULL role/type won't be filtered out unintentionally
      where.push(`
        COALESCE(LOWER(u.role), '') NOT IN (SELECT UNNEST($${values.length - 1}::text[]))
        AND COALESCE(LOWER(u.type), '') NOT IN (SELECT UNNEST($${values.length}::text[]))
      `);
    }

    // Wallet requirement (safer than INNER JOIN; relies on users.wallet_id being set)
    if (String(hasWallet || "").toLowerCase() === "true") {
      where.push("u.wallet_id IS NOT NULL");
    }

    // WHERE + ORDER
    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const validSort = ["first_name", "last_name", "email"];
    const sortColumn = validSort.includes(sortBy) ? sortBy : "first_name";
    const sortDir = sortDirection === "desc" ? "DESC" : "ASC";

    if (isAutocomplete) {
      const { rows } = await pool.query(
        `
        SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.type, u.wallet_id
        FROM users u
        ${join}
        ${whereSQL}
        ORDER BY ${sortColumn} ${sortDir}, u.email
        LIMIT 10
        `,
        values
      );
      return res.json(rows);
    }

    // Pagination mode
    const limit = parseInt(perPage, 10) || 10;
    const offset = ((parseInt(page, 10) || 1) - 1) * limit;

    const dataSql = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.type, u.status, u.wallet_id
      FROM users u
      ${join}
      ${whereSQL}
      ORDER BY ${sortColumn} ${sortDir}, u.email
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;
    const countSql = `
      SELECT COUNT(*)::int AS cnt
      FROM users u
      ${join}
      ${whereSQL}
    `;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(countSql, values),
      pool.query(dataSql, [...values, limit, offset]),
    ]);

    return res.json({
      users: rows,
      total: countRows[0]?.cnt || 0,
      totalPages: Math.ceil((countRows[0]?.cnt || 0) / limit),
    });
  } catch (err) {
    console.error("❌ Error in GET /api/users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// ✅ Update user (with suspend/unsuspend tracking)
router.patch("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
    // --- protection guard ---
  const callerId = req.user?.id || req.user?.userId;
  const guard = await guardProtectedUser(id, callerId);
  if (guard.blocked) {
    return res.status(guard.code).json({ message: guard.message });
  }
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
    // --- protection guard ---
  const callerId = req.user?.id || req.user?.userId;
  const guard = await guardProtectedUser(id, callerId);
  if (guard.blocked) {
    return res.status(guard.code).json({ message: guard.message });
  }
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
    // --- protection guard ---
  const callerId = req.user?.id || req.user?.userId;
  const guard = await guardProtectedUser(id, callerId);
  if (guard.blocked) {
    return res.status(guard.code).json({ message: guard.message });
  }
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
  // --- protection guard ---
  const callerId = req.user?.id || req.user?.userId;
  const guard = await guardProtectedUser(id, callerId);
  if (guard.blocked) {
    return res.status(guard.code).json({ message: guard.message });
  }
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


module.exports = router;
