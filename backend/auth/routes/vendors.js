// backend/auth/routes/vendors.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

/* -------------------------------------------------------------------------
   ⚠️ MOUNTING NOTE
   This single router file is mounted twice in server.js:

     - /api/vendors  → Admin-only endpoints (requireAdmin)
     - /api/vendor   → Vendor self-service endpoints (requireVendor)

   Route-level guards below enforce who can call which endpoints.
---------------------------------------------------------------------------*/

// ───────────────────────────────── helpers ─────────────────────────────────
function requireAdmin(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") return res.status(403).json({ message: "Vendor role required." });
  next();
}
function toInt(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}
async function audit({ action, status = "completed", adminId, targetUserId }) {
  try {
    await db.query(
      `INSERT INTO admin_actions (action, status, performed_by, target_user_id, requested_at, completed_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [action, status, adminId || null, targetUserId || null]
    );
  } catch (e) {
    console.warn("⚠️ admin_actions insert failed:", e.message || e);
  }
}

// ─────────────────────────── vendor self profile ───────────────────────────
// GET /api/vendor/profile  → returns business_name + basic user info
router.get("/profile", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    const { rows } = await db.query(
      `
      SELECT
        u.id,
        u.email,
        LOWER(u.role)  AS role,
        u.first_name,
        u.last_name,
        v.business_name
      FROM users u
      LEFT JOIN vendors v ON v.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) return res.status(404).json({ message: "Vendor not found" });

    const me = rows[0];
    return res.json({
      id: me.id,
      email: me.email,
      role: me.role,
      first_name: me.first_name,
      last_name: me.last_name,
      business_name: me.business_name || null,
    });
  } catch (err) {
    console.error("❌ GET /api/vendor/profile error:", err);
    return res.status(500).json({ message: "Failed to load vendor profile." });
  }
});

// ─────────────────────── admin: block direct create ────────────────────────
// POST /api/vendors  → blocked; create via /api/users
router.post("/", (req, res) => {
  res.status(405).json({ error: "Use /api/users to create vendors." });
});

// ─────────────────────── admin: list active vendors ────────────────────────
// GET /api/vendors
router.get("/", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, u.email, u.first_name, u.last_name
         FROM vendors v
         JOIN users u ON v.user_id = u.id
        WHERE u.deleted_at IS NULL
          AND u.status = 'active'
          AND u.role = 'vendor'`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch vendors:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ────────────────────────── admin: update vendor ───────────────────────────
// PATCH /api/vendors/:id   (id = vendor's user_id)
router.patch("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  const business_name = typeof req.body.business_name === "string"
    ? req.body.business_name.trim()
    : null;
  const category = typeof req.body.category === "string"
    ? req.body.category.trim()
    : null;
  const phone = typeof req.body.phone === "string"
    ? req.body.phone.trim()
    : null;

  try {
    const result = await db.query(
      `UPDATE vendors
          SET business_name = COALESCE($1, business_name),
              category      = COALESCE($2, category),
              phone         = COALESCE($3, phone)
        WHERE user_id = $4
      RETURNING *`,
      [business_name, category, phone, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Vendor not found" });

    await audit({ action: "update_vendor", adminId, targetUserId: id });
    res.json({ message: "Vendor updated", vendor: result.rows[0] });
  } catch (err) {
    console.error("❌ Vendor update failed:", err);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

// ───────────────────────── admin: soft-delete vendor ───────────────────────
// DELETE /api/vendors/:id   (id = vendor's user_id)
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  const client = await (db.pool?.connect ? db.pool.connect() : db.connect?.());
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `UPDATE users
          SET deleted_at = NOW(),
              status = 'suspended'
        WHERE id = $1
          AND role = 'vendor'
      RETURNING id`,
      [id]
    );

    if (!userRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Vendor not found or already deleted" });
    }

    try {
      await client.query(`UPDATE vendors SET active = FALSE WHERE user_id = $1`, [id]);
    } catch (_) { /* optional column; ignore if missing */ }

    await client.query("COMMIT");
    await audit({ action: "delete_vendor", adminId, targetUserId: id });

    res.json({ message: "Vendor soft-deleted", vendor_id: userRes.rows[0].id });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌ Failed to soft-delete vendor:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    if (client?.release) client.release();
  }
});

/* ===========================================================================
   VENDOR REPORTS (self-service)
   GET /api/vendor/transactions/report
   - Only for signed-in vendors
   - Shows ONLY money RECEIVED by the vendor (credits)
   - Filters: ?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=25&offset=0
   - Response:
       {
         transactions: [{
           id, type, amount_cents, note, created_at,
           customer_name, business_name, direction, counterparty_label
         }],
         totalCount
       }
===========================================================================*/
router.get("/transactions/report", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    // Resolve vendor_id + business_name for this user
    const vendRes = await db.query(
      `SELECT v.id AS vendor_id, COALESCE(v.business_name, '') AS business_name
         FROM vendors v
        WHERE v.user_id = $1
        LIMIT 1`,
      [userId]
    );
    if (!vendRes.rowCount) {
      return res.status(404).json({ message: "Vendor profile not found." });
    }
    const vendorId = vendRes.rows[0].vendor_id;
    const businessName = vendRes.rows[0].business_name;

    // Build filters
    const { start, end } = req.query;
    const where = [`t.vendor_id = $1`, `LOWER(t.type) = 'credit'`]; // vendor sees only credits
    const params = [vendorId];

    if (start) { params.push(start); where.push(`t.created_at >= $${params.length}`); }
    if (end)   { params.push(end + " 23:59:59.999"); where.push(`t.created_at <= $${params.length}`); }

    const whereSQL = `WHERE ${where.join(" AND ")}`;

    // Count
    const countSql = `SELECT COUNT(*)::int AS cnt FROM transactions t ${whereSQL}`;
    const countRes = await db.query(countSql, params);
    const totalCount = countRes.rows[0]?.cnt || 0;

    // Paging
    const limit  = Math.min(Math.max(toInt(req.query.limit || "25", 25), 1), 200);
    const offset = Math.max(toInt(req.query.offset || "0", 0), 0);

    // Data:
    // For credits to vendor, sender_id is the customer (buyer).
    const dataSql = `
      SELECT
        t.id,
        t.type,
        t.amount_cents,
        t.note,
        t.created_at,
        TRIM(COALESCE(sf.first_name,'') || ' ' || COALESCE(sf.last_name,'')) AS customer_name,
        $${params.length + 1}::text AS business_name,
        'received'::text AS direction,
        -- UI label vendors should show:
        'Received from ' ||
          COALESCE(
            NULLIF(TRIM(COALESCE(sf.first_name,'') || ' ' || COALESCE(sf.last_name,'')), ''),
            'Customer'
          ) AS counterparty_label
      FROM transactions t
      LEFT JOIN users sf ON sf.id = t.sender_id
      ${whereSQL}
      ORDER BY t.created_at DESC
      LIMIT $${params.length + 2}
      OFFSET $${params.length + 3}
    `;

    const dataRes = await db.query(dataSql, [...params, businessName, limit, offset]);

    return res.json({
      transactions: dataRes.rows,
      totalCount
    });
  } catch (err) {
    console.error("❌ /api/vendor/transactions/report error:", err);
    return res.status(500).json({ message: "Failed to load vendor transactions." });
  }
});

module.exports = router;
