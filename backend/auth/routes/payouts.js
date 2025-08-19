// backend/auth/routes/payouts.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

/**
 * Status policy:
 * - Pending-like statuses we show as "pending payouts":
 *   'pending', 'claimed', 'submitted'
 * - Finished statuses (not shown in pending): 'completed', 'rejected'
 */
const PENDING_STATUSES = ["pending", "claimed", "submitted"];

function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") return res.status(403).json({ message: "Vendor role required." });
  next();
}
const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

// Normalize timestamps from either schema style
const CREATED_SQL = `COALESCE(t.created_at, t.requested_at)`;

/**
 * GET /api/payouts/pending/summary
 * → { count, total_cents }
 */
router.get("/pending/summary", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const q = `
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(t.amount_cents), 0)::bigint AS total_cents
      FROM transfers t
      WHERE t.user_id = $1
        AND LOWER(t.status) = ANY($2)
    `;
    const { rows } = await db.query(q, [userId, PENDING_STATUSES]);
    // rows[0].total_cents may come back as string in some pg configs
    const count = rows[0]?.count || 0;
    const total_cents = Number(rows[0]?.total_cents || 0);
    return res.json({ count, total_cents });
  } catch (err) {
    console.error("❌ payouts/pending/summary error:", err);
    return res.status(500).json({ message: "Failed to load pending payouts summary." });
  }
});

/**
 * GET /api/payouts/pending?limit=25&offset=0
 * List the vendor's pending payouts (most recent first)
 */
router.get("/pending", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const limit  = Math.min(Math.max(toInt(req.query.limit, 25), 1), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const q = `
      SELECT
        t.id,
        t.user_id,
        t.bank_account_id,
        t.amount_cents,
        COALESCE(NULLIF(LOWER(t.status), ''), 'submitted') AS status,
        ${CREATED_SQL} AS created_at,
        ba.bank_name,
        RIGHT(ba.account_number, 4) AS last4
      FROM transfers t
      LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
      WHERE t.user_id = $1
        AND COALESCE(LOWER(t.status), 'submitted') = ANY($2)
      ORDER BY ${CREATED_SQL} DESC
      LIMIT $3 OFFSET $4
    `;
    const { rows } = await db.query(q, [userId, PENDING_STATUSES, limit, offset]);

    // Also return a total count for pagination
    const cq = `
      SELECT COUNT(*)::int AS total
      FROM transfers t
      WHERE t.user_id = $1
        AND COALESCE(LOWER(t.status), 'submitted') = ANY($2)
    `;
    const { rows: crows } = await db.query(cq, [userId, PENDING_STATUSES]);

    return res.json({ items: rows, total: crows[0]?.total || 0 });
  } catch (err) {
    console.error("❌ payouts/pending error:", err);
    return res.status(500).json({ message: "Failed to load pending payouts." });
  }
});

/**
 * GET /api/payouts?status=pending|completed|all&limit=&offset=
 * General vendor payouts list with a simple status filter.
 * Defaults to pending-like set if `status` is missing/unknown.
 */
router.get("/", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const limit  = Math.min(Math.max(toInt(req.query.limit, 25), 1), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const statusParam = String(req.query.status || "").toLowerCase();
    let statusList;

    if (statusParam === "completed") {
      statusList = ["completed"];
    } else if (statusParam === "rejected") {
      statusList = ["rejected"];
    } else if (statusParam === "all") {
      // show everything
      statusList = null;
    } else {
      // default: pending-like
      statusList = PENDING_STATUSES;
    }

    const values = [userId];
    const where = [`t.user_id = $1`];

    if (statusList) {
      values.push(statusList);
      where.push(`COALESCE(LOWER(t.status), 'submitted') = ANY($${values.length})`);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const listSql = `
      SELECT
        t.id,
        t.user_id,
        t.bank_account_id,
        t.amount_cents,
        COALESCE(NULLIF(LOWER(t.status), ''), 'submitted') AS status,
        ${CREATED_SQL} AS created_at,
        ba.bank_name,
        RIGHT(ba.account_number, 4) AS last4
      FROM transfers t
      LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
      ${whereSql}
      ORDER BY ${CREATED_SQL} DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM transfers t
      ${whereSql}
    `;

    const { rows } = await db.query(listSql, [...values, limit, offset]);
    const { rows: crows } = await db.query(countSql, values);

    return res.json({ items: rows, total: crows[0]?.total || 0 });
  } catch (err) {
    console.error("❌ payouts list error:", err);
    return res.status(500).json({ message: "Failed to load payouts." });
  }
});

module.exports = router;
