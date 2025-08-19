// auth/routes/payouts.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") {
    return res.status(403).json({ message: "Vendor role required." });
  }
  next();
}

const PENDING_SET = ["pending", "claimed", "submitted"];

/* ---------------------------------------------------------------------------
   GET /api/payouts/pending
   Returns { pending_count, pending_total_cents }
---------------------------------------------------------------------------*/
router.get("/pending", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const sql = `
      SELECT
        COUNT(*)::int                        AS pending_count,
        COALESCE(SUM(amount_cents), 0)::int AS pending_total_cents
      FROM transfers
      WHERE user_id = $1
        AND LOWER(COALESCE(status,'pending')) = ANY($2)
    `;
    const { rows } = await db.query(sql, [userId, PENDING_SET]);
    res.json(rows[0] || { pending_count: 0, pending_total_cents: 0 });
  } catch (err) {
    console.error("❌ /api/payouts/pending error:", err);
    res.status(500).json({ message: "Failed to load pending payouts." });
  }
});

/* ---------------------------------------------------------------------------
   GET /api/payouts/history?limit=25&offset=0
   Returns { items: [...], total }
---------------------------------------------------------------------------*/
router.get("/history", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "25", 10), 1), 200);
    const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

    const sql = `
      SELECT
        t.id,
        t.amount_cents,
        LOWER(COALESCE(t.status, 'submitted')) AS status,
        COALESCE(t.completed_at, t.requested_at, t.created_at) AS created_at,
        -- prefer explicit bank column; fallback to parsing the masked destination
        COALESCE(
          t.bank,
          NULLIF(regexp_replace(t.destination_masked, '\\s*•.*$', ''), '')
        ) AS bank_name,
        NULLIF(regexp_replace(t.destination_masked, '.*(\\d{4})\\s*$', '\\1'), '') AS last4
      FROM transfers t
      WHERE t.user_id = $1
      ORDER BY COALESCE(t.completed_at, t.requested_at, t.created_at) DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await db.query(sql, [userId, limit, offset]);
    res.json({ items: rows, total: rows.length });
  } catch (err) {
    console.error("❌ /api/payouts/history error:", err);
    res.status(500).json({ message: "Failed to load payout history." });
  }
});

module.exports = router;
