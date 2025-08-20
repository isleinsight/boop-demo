// backend/auth/routes/vendor-passport.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

// guard
function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") {
    return res.status(403).json({ message: "Vendor role required." });
  }
  next();
}

// helpers
function centsFromAmount(amount) {
  // amount may come as number or string; expect dollars
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function refCode() {
  return (
    "VP" +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    Date.now().toString().slice(-6)
  );
}

/**
 * POST /api/vendor/passport-charge
 * body: { passport_id: string, amount: number (dollars) OR amount_cents: int, note?: string }
 * returns: { ok: true, reference_code, amount_cents, customer_user_id, vendor_user_id }
 */
router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const vendorUserId = req.user?.id || req.user?.userId;
  let { passport_id, amount, amount_cents, note } = req.body || {};

  try {
    // normalize amount
    let cents = Number.isFinite(amount_cents) ? Number(amount_cents) : centsFromAmount(amount);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ message: "Invalid amount." });
    }
    note = (note || "").toString().slice(0, 200);

    const client = await (db.pool?.connect ? db.pool.connect() : db.connect?.());

    try {
      await client.query("BEGIN");

      // 1) resolve vendor_id and vendor wallet
      const vendRes = await client.query(
        `SELECT id AS vendor_id FROM vendors WHERE user_id = $1 LIMIT 1`,
        [vendorUserId]
      );
      if (!vendRes.rowCount) {
        throw new Error("Vendor profile not found for this user.");
      }
      const vendorId = vendRes.rows[0].vendor_id;

      const vWalletRes = await client.query(
        `SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [vendorUserId]
      );
      if (!vWalletRes.rowCount) throw new Error("Vendor wallet not found.");
      const vWallet = vWalletRes.rows[0];
      const vBal0 = Number(vWallet.balance || 0); // assume cents (INTEGER)

      // 2) resolve customer by passport_id (supports passports table OR users.passport_id)
      const custRes = await client.query(
        `
        WITH found AS (
          SELECT p.user_id
          FROM passports p
          WHERE p.passport_id = $1
          LIMIT 1
        )
        SELECT u.id AS user_id
        FROM users u
        WHERE u.id = COALESCE((SELECT user_id FROM found), NULL)
           OR u.passport_id = $1
        LIMIT 1
        `,
        [passport_id]
      );
      if (!custRes.rowCount) throw new Error("Passport not found.");

      const customerUserId = custRes.rows[0].user_id;

      const cWalletRes = await client.query(
        `SELECT id, balance FROM wallets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [customerUserId]
      );
      if (!cWalletRes.rowCount) throw new Error("Customer wallet not found.");
      const cWallet = cWalletRes.rows[0];
      const cBal0 = Number(cWallet.balance || 0);

      // 3) balance check (cents)
      if (cBal0 < cents) {
        return res.status(400).json({ message: "Insufficient funds." });
      }

      // 4) write double-entry transactions
      const reference = refCode();

      // customer debit
      await client.query(
        `
        INSERT INTO transactions
          (type, amount_cents, sender_id, recipient_id, vendor_id, note, reference_code, created_at)
        VALUES
          ('debit', $1, $2, $3, $4, $5, $6, NOW())
        `,
        [cents, customerUserId, vendorUserId, vendorId, note, reference]
      );

      // vendor credit
      await client.query(
        `
        INSERT INTO transactions
          (type, amount_cents, sender_id, recipient_id, vendor_id, note, reference_code, created_at)
        VALUES
          ('credit', $1, $2, $3, $4, $5, $6, NOW())
        `,
        [cents, customerUserId, vendorUserId, vendorId, note, reference]
      );

      // 5) update balances (cents)
      const cBal1 = cBal0 - cents;
      const vBal1 = vBal0 + cents;

      await client.query(
        `UPDATE wallets SET balance = $1 WHERE id = $2`,
        [cBal1, cWallet.id]
      );
      await client.query(
        `UPDATE wallets SET balance = $1 WHERE id = $2`,
        [vBal1, vWallet.id]
      );

      await client.query("COMMIT");

      return res.json({
        ok: true,
        reference_code: reference,
        amount_cents: cents,
        customer_user_id: customerUserId,
        vendor_user_id: vendorUserId,
      });
    } catch (err) {
      // IMPORTANT: roll back this tx so we don't get the 25P02 state
      try { await client.query("ROLLBACK"); } catch (_) {}
      console.error("❌ passport-charge failed:", err.message);
      // if err is from PG, surface detail/constraint too
      if (err?.code) {
        console.error("   pg code:", err.code, "detail:", err.detail, "where:", err.where);
      }
      return res.status(400).json({ message: err.message || "Charge failed." });
    } finally {
      if (client?.release) client.release();
    }
  } catch (e) {
    console.error("🔥 passport-charge handler error:", e);
    return res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
