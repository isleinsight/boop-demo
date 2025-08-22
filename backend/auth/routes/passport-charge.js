// backend/auth/routes/passport-charge.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

/** Require the caller to be a vendor user */
function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") {
    return res.status(403).json({ message: "Vendor role required." });
  }
  next();
}

/**
 * POST /api/vendor/passport-charge
 * Body: { passport_id: string, amount?: number, amount_cents?: number, note?: string }
 *
 * Flow:
 *  - Resolve buyer from passports.passport_id → users → wallets
 *  - Resolve vendor_id + vendor wallet from current user
 *  - Lock wallets (sorted) FOR UPDATE
 *  - Check buyer funds
 *  - Update balances
 *  - Insert two transaction rows (debit for buyer, credit for vendor)
 */
router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const vendorUserId = req.user?.id || req.user?.userId;
  const { passport_id, amount, amount_cents, note } = req.body || {};

  try {
    // ---- validate input & normalize cents ----
    if (!passport_id) {
      return res.status(400).json({ message: "passport_id is required" });
    }

    let cents = null;
    if (Number.isFinite(amount_cents)) {
      cents = Math.round(Number(amount_cents));
    } else if (Number.isFinite(Number(amount))) {
      const dec = Number(amount);
      if (dec > 0) cents = Math.round(dec * 100);
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ message: "Provide a positive amount or amount_cents" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // ---- 1) Resolve buyer via passports table ----
      const buyerQ = `
        SELECT u.id   AS user_id,
               w.id   AS wallet_id,
               COALESCE(w.balance, 0)::bigint AS balance
          FROM passports p
          JOIN users     u ON u.id = p.user_id
          JOIN wallets   w ON w.user_id = u.id
         WHERE p.passport_id = $1
         LIMIT 1
      `;
      const buyerRes = await client.query(buyerQ, [passport_id]);
      if (!buyerRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Passport not found" });
      }
      const buyer = buyerRes.rows[0];

      // ---- 2) Resolve vendor_id + vendor wallet from current vendor user ----
      const vendQ = `
        SELECT v.id AS vendor_id,
               w.id AS wallet_id,
               COALESCE(w.balance, 0)::bigint AS balance
          FROM vendors v
          JOIN users   u ON u.id = v.user_id
          JOIN wallets w ON w.user_id = u.id
         WHERE u.id = $1
         LIMIT 1
      `;
      const vendRes = await client.query(vendQ, [vendorUserId]);
      if (!vendRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Vendor profile or wallet not found" });
      }
      const vendor = vendRes.rows[0];

      // ---- 3) Lock both wallets (sorted to avoid deadlocks) ----
      const lockIds = [buyer.wallet_id, vendor.wallet_id].sort();
      await client.query(
        `SELECT id FROM wallets WHERE id = ANY($1) FOR UPDATE`,
        [lockIds]
      );

      // ---- 4) Recheck buyer balance under lock ----
      const balRes = await client.query(`SELECT COALESCE(balance,0)::bigint AS balance FROM wallets WHERE id = $1`, [buyer.wallet_id]);
      const buyerBal = Number(balRes.rows?.[0]?.balance || 0);
      if (buyerBal < cents) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // ---- 5) Update balances ----
      await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
        [cents, buyer.wallet_id]
      );
      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
        [cents, vendor.wallet_id]
      );

      // ---- 6) Insert transactions (double-entry) ----
      // IMPORTANT: Your transactions table has a NOT NULL user_id.
      // We’ll set user_id = buyer.user_id for the debit row, and user_id = vendorUserId for the credit row.
      // If your table doesn’t have currency, Postgres will ignore extra columns (since we specify column list).
      const currency = "BMD";
      const nowSql   = "NOW()";

      // Buyer side (money leaving) → type = 'debit'
      await client.query(
        `INSERT INTO transactions
           (type, amount_cents, currency, note, vendor_id, user_id, sender_id, recipient_id, created_at)
         VALUES
           ('debit', $1, $2, $3, $4, $5, $6, $7, ${nowSql})`,
        [cents, currency, note || null, vendor.vendor_id, buyer.user_id, buyer.user_id, vendorUserId]
      );

      // Vendor side (money coming in) → type = 'credit'
      await client.query(
        `INSERT INTO transactions
           (type, amount_cents, currency, note, vendor_id, user_id, sender_id, recipient_id, created_at)
         VALUES
           ('credit', $1, $2, $3, $4, $5, $6, $7, ${nowSql})`,
        [cents, currency, note || null, vendor.vendor_id, vendorUserId, buyer.user_id, vendorUserId]
      );

      await client.query("COMMIT");
      return res.status(200).json({
        status: "success",
        amount_cents: cents,
        vendor_id: vendor.vendor_id,
        buyer_id: buyer.user_id,
        message: "Charge completed"
      });
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("❌ /api/vendor/passport-charge error:", err);
      return res.status(500).json({ message: "Charge failed" });
    }
    finally {
      if (client?.release) client.release();
    }
  } catch (err) {
    console.error("🔥 passport-charge unhandled:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
