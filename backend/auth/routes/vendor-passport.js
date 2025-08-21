// auth/routes/vendor-passport.js
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
 * POST /api/vendor/passport-charge
 * Body: { passport_id: string, amount: number, note?: string }
 */
router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const vendorUserId = req.user?.id || req.user?.userId;
  const { passport_id, amount, note } = req.body || {};

  try {
    const amt = Number(amount);
    if (!passport_id || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "passport_id and positive amount are required" });
    }
    const amountCents = Math.round(amt * 100);

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 1) Resolve buyer via passports table
      const buyerRes = await client.query(
        `
        SELECT u.id    AS user_id,
               w.id    AS wallet_id,
               w.balance
          FROM passports p
          JOIN users     u ON u.id = p.user_id
          JOIN wallets   w ON w.user_id = u.id
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

      // 2) Resolve vendor_id + vendor wallet
      const vendRes = await client.query(
        `
        SELECT v.id  AS vendor_id,
               w.id  AS wallet_id,
               w.balance
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

      // 3) Lock both wallets (sorted to avoid deadlocks)
      const lockIds = [buyer.wallet_id, vendor.wallet_id].sort();
      await client.query(
        `SELECT id FROM wallets WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [lockIds]
      );

      // 4) Check buyer funds
      const bBal = await client.query(`SELECT balance FROM wallets WHERE id = $1`, [buyer.wallet_id]);
      if (!bBal.rowCount || Number(bBal.rows[0].balance) < amountCents) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // 5) Update balances
      await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [amountCents, buyer.wallet_id]);
      await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [amountCents, vendor.wallet_id]);

      // 6) Insert transactions – buyer debit + vendor credit
      await client.query(
        `INSERT INTO transactions
           (type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
         VALUES ('debit',  $1, $2, $3, $4, $5, NOW())`,
        [amountCents, note || null, vendor.vendor_id, buyer.user_id, vendorUserId]
      );
      await client.query(
        `INSERT INTO transactions
           (type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
         VALUES ('credit', $1, $2, $3, $4, $5, NOW())`,
        [amountCents, note || null, vendor.vendor_id, buyer.user_id, vendorUserId]
      );

      await client.query("COMMIT");
      res.json({
        status: "success",
        message: "Charge completed",
        amount_cents: amountCents,
        buyer_id: buyer.user_id,
        vendor_id: vendor.vendor_id
      });
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("❌ /api/vendor/passport-charge error:", err);
      res.status(500).json({ message: "Charge failed" });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("🔥 passport-charge unhandled:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
