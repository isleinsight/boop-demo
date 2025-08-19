// backend/auth/routes/sales.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") return res.status(403).json({ message: "Vendor role required." });
  next();
}

/**
 * GET /api/sales/today
 * → { total_cents, count }
 *
 * Definition of "sale":
 * - Transaction rows where vendor_id = current vendor
 * - type = 'credit' (money coming in from a customer)
 * - created_at between midnight and now
 */
router.get("/today", authenticateToken, requireVendor, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    // Resolve this vendor's vendor_id
    const vendRes = await db.query(
      `SELECT id FROM vendors WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!vendRes.rowCount) {
      return res.status(404).json({ message: "Vendor profile not found." });
    }
    const vendorId = vendRes.rows[0].id;

    // Today’s date range (midnight → now)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();

    const q = `
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(t.amount_cents), 0)::bigint AS total_cents
      FROM transactions t
      WHERE t.vendor_id = $1
        AND LOWER(t.type) = 'credit'
        AND t.created_at >= $2
        AND t.created_at <= $3
    `;
    const { rows } = await db.query(q, [vendorId, start, end]);
    return res.json({
      count: rows[0]?.count || 0,
      total_cents: Number(rows[0]?.total_cents || 0)
    });
  } catch (err) {
    console.error("❌ sales/today error:", err);
    return res.status(500).json({ message: "Failed to load today's sales." });
  }
});

module.exports = router;
