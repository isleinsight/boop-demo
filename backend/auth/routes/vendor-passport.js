// backend/auth/routes/vendor-passport.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// ───────────────────────────────────────────────────────────────
// Vendor-only guard (matches your style)
function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") {
    return res.status(403).json({ message: "Vendor role required." });
  }
  next();
}

/**
 * POST /api/vendor/passport-charge
 * Body: { passport_id: string, amount: number, note?: string }
 *
 * Flow:
 *  1) Resolve buyer by passport_id → buyer user_id + wallet
 *  2) Resolve current vendor → vendor_id + wallet
 *  3) Lock both wallets (sorted) FOR UPDATE
 *  4) Ensure buyer has funds
 *  5) Update balances (buyer -amount, vendor +amount)
 *  6) Insert two transactions (double-entry) and include user_id
 */
router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const vendorUserId = req.user?.id || req.user?.userId;
  const { passport_id, amount, note } = req.body || {};

  try {
    // basic validation
    const amtNum = Number(amount);
    if (!passport_id || !Number.isFinite(amtNum) || amtNum <= 0) {
      return res.status(400).json({ message: "passport_id and positive amount are required" });
    }
    const amountCents = Math.round(amtNum * 100);

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 1) Resolve buyer from passport_ids
      //    (users.passport_id is NOT used; your table is passport_ids)
      const buyerRes = await client.query(
        `
        SELECT u.id AS user_id, w.id AS wallet_id, w.balance
        FROM passport_ids p
        JOIN users u   ON u.id = p.user_id
        JOIN wallets w ON w.user_id = u.id
        WHERE p.passport_id = $1
        LIMIT 1
        `,
        [passport_id]
      );
      if (!buyerRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Passport not found" });
      }
      const buyer = buyerRes.rows[0];

      // 2) Resolve vendor profile + wallet
      const vendRes = await client.query(
        `
        SELECT v.id AS vendor_id, w.id AS wallet_id, w.balance
        FROM vendors v
        JOIN users   u ON u.id = v.user_id
        JOIN wallets w ON w.user_id = u.id
        WHERE u.id = $1
        LIMIT 1
        `,
        [vendorUserId]
      );
      if (!vendRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Vendor profile or wallet not found" });
      }
      const vendor = vendRes.rows[0];

      // 3) Lock both wallets deterministically to avoid deadlocks
      const lockIds = [buyer.wallet_id, vendor.wallet_id].sort();
      await client.query(
        `SELECT id FROM wallets WHERE id = ANY($1) FOR UPDATE`,
        [lockIds]
      );

      // 4) Check funds on buyer wallet (after lock)
      const buyerBalRes = await client.query(
        `SELECT balance FROM wallets WHERE id = $1`,
        [buyer.wallet_id]
      );
      const buyerBalance = Number(buyerBalRes.rows?.[0]?.balance || 0);
      if (buyerBalance < amountCents) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // 5) Update balances
      await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
        [amountCents, buyer.wallet_id]
      );
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
        [amountCents, vendor.wallet_id]
      );

      // 6) Insert transactions (double-entry) and include user_id
      // Buyer side (debit): user_id = buyer.user_id
      const debitIns = await client.query(
        `
        INSERT INTO transactions
          (user_id, type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
        VALUES
          ($1, 'debit', $2, $3, $4, $5, $6, NOW())
        RETURNING id
        `,
        [buyer.user_id, amountCents, note || null, vendor.vendor_id, buyer.user_id, vendorUserId]
      );

      // Vendor side (credit): user_id = vendorUserId
      const creditIns = await client.query(
        `
        INSERT INTO transactions
          (user_id, type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
        VALUES
          ($1, 'credit', $2, $3, $4, $5, $6, NOW())
        RETURNING id
        `,
        [vendorUserId, amountCents, note || null, vendor.vendor_id, buyer.user_id, vendorUserId]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",
        message: "Charge completed",
        amount_cents: amountCents,
        buyer_id: buyer.user_id,
        vendor_id: vendor.vendor_id,
        txns: {
          debit_id: debitIns.rows[0].id,
          credit_id: creditIns.rows[0].id
        }
      });
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("❌ /api/vendor/passport-charge error:", err);
      return res.status(500).json({ message: "Charge failed" });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("🔥 passport-charge unhandled:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
