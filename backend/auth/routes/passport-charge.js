// backend/auth/routes/passport-charge.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") return res.status(403).json({ message: "Vendor role required." });
  next();
}

router.get("/ping", (_req, res) => res.json({ ok: true, scope: "passport-charge" }));

router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const vendorUserId = req.user?.id || req.user?.userId;
  const { passport_id, amount, note } = req.body || {};

  try {
    const amt = Number(amount);
    if (!passport_id || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "passport_id and positive amount are required" });
    }
    const amountCents = Math.round(amt * 100);

    const client = await (db.pool?.connect ? db.pool.connect() : db.connect?.());
    try {
      await client.query("BEGIN");

      // 1) Buyer by users.passport_id
      let buyer = null;
      let r = await client.query(
        `SELECT u.id AS user_id, w.id AS wallet_id, w.balance
           FROM users u
           JOIN wallets w ON w.user_id = u.id
          WHERE u.passport_id = $1
          LIMIT 1`,
        [passport_id]
      );
      if (r.rowCount) buyer = r.rows[0];

      // 1b) Fallback to passports table
      if (!buyer) {
        r = await client.query(
          `SELECT u.id AS user_id, w.id AS wallet_id, w.balance
             FROM passports p
             JOIN users   u ON u.id = p.user_id
             JOIN wallets w ON w.user_id = u.id
            WHERE p.passport_id = $1
            LIMIT 1`,
          [passport_id]
        );
        if (r.rowCount) buyer = r.rows[0];
      }
      if (!buyer) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Passport not found" });
      }

      // 2) Vendor wallet
      const vres = await client.query(
        `SELECT v.id AS vendor_id, w.id AS wallet_id, w.balance
           FROM vendors v
           JOIN users   u ON u.id = v.user_id
           JOIN wallets w ON w.user_id = u.id
          WHERE u.id = $1
          LIMIT 1`,
        [vendorUserId]
      );
      if (!vres.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Vendor profile or wallet not found" });
      }
      const vendor = vres.rows[0];

      // 3) Lock wallets (avoid deadlocks)
      const lockIds = [buyer.wallet_id, vendor.wallet_id].sort();
      await client.query(`SELECT id FROM wallets WHERE id = ANY($1) FOR UPDATE`, [lockIds]);

      // 4) Funds check
      const balRes = await client.query(`SELECT balance FROM wallets WHERE id = $1`, [buyer.wallet_id]);
      if (Number(balRes.rows?.[0]?.balance || 0) < amountCents) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // 5) Balances
      await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [amountCents, buyer.wallet_id]);
      await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [amountCents, vendor.wallet_id]);

      // 6) Double-entry rows (note: user_id is NOT NULL in your schema)
      await client.query(
        `INSERT INTO transactions
           (user_id, type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
         VALUES
           ($1,      'debit', $2,           $3,   $4,        $5,        $6,           NOW())`,
        [buyer.user_id, amountCents, note || null, vendor.vendor_id, buyer.user_id, vendorUserId]
      );
      await client.query(
        `INSERT INTO transactions
           (user_id, type, amount_cents, note, vendor_id, sender_id, recipient_id, created_at)
         VALUES
           ($1,      'credit', $2,           $3,   $4,        $5,        $6,           NOW())`,
        [vendorUserId, amountCents, note || null, vendor.vendor_id, buyer.user_id, vendorUserId]
      );

      await client.query("COMMIT");
      res.json({ status: "success", amount_cents: amountCents, vendor_id: vendor.vendor_id, buyer_id: buyer.user_id });
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("❌ /api/vendor/passport-charge error:", err);
      res.status(500).json({ message: "Charge failed" });
    } finally {
      if (typeof client?.release === "function") client.release();
    }
  } catch (err) {
    console.error("🔥 passport-charge unhandled:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
