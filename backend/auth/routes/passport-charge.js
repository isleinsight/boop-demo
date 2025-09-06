// File: backend/auth/routes/passport-charge.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

/* why: vendor-only endpoint */
function requireVendor(req, res, next) {
  const role = (req.user?.role || "").toLowerCase();
  if (role !== "vendor") return res.status(403).json({ message: "Vendor role required." });
  next();
}

/* normalize amount to cents (int) */
function toCents({ amount, amount_cents }) {
  const asIntCents = Number(amount_cents);
  if (Number.isFinite(asIntCents) && asIntCents > 0) return Math.round(asIntCents);

  const dollars = Number(typeof amount === "string" ? amount.trim() : amount);
  if (Number.isFinite(dollars) && dollars > 0) return Math.round(dollars * 100);

  return null;
}

/**
 * POST /api/vendor/passport-charge
 * Body: { passport_id?: string, pid?: string, amount?: number|string, amount_cents?: number|string, note?: string }
 */
router.post("/passport-charge", authenticateToken, requireVendor, async (req, res) => {
  const vendorUserId = req.user?.id || req.user?.userId;
  const rawPid = req.body?.passport_id ?? req.body?.pid;
  const passport_id = String(rawPid || "").trim();
  const cents = toCents(req.body || {});
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

  // input validation with clear messages
  if (!passport_id) return res.status(400).json({ message: "passport_id (or pid) is required" });
  if (!Number.isFinite(cents) || cents <= 0) {
    return res.status(400).json({ message: "Provide a positive amount (amount or amount_cents)" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // 1) buyer from passport
    const buyerQ = `
      SELECT u.id AS user_id,
             w.id AS wallet_id,
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

    // 2) vendor wallet from current vendor user
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

    // 3) lock wallets
    const lockIds = [buyer.wallet_id, vendor.wallet_id].sort();
    await client.query(`SELECT id FROM wallets WHERE id = ANY($1) FOR UPDATE`, [lockIds]);

    // 4) re-check buyer balance under lock
    const balRes = await client.query(
      `SELECT COALESCE(balance,0)::bigint AS balance FROM wallets WHERE id = $1`,
      [buyer.wallet_id]
    );
    const buyerBal = Number(balRes.rows?.[0]?.balance || 0);
    if (buyerBal < cents) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient funds" });
    }

    // 5) update balances
    await client.query(`UPDATE wallets SET balance = balance - $1 WHERE id = $2`, [cents, buyer.wallet_id]);
    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [cents, vendor.wallet_id]);

    // 6) transactions (double-entry)
    const currency = "BMD";
    const nowSql = "NOW()";

    // buyer: debit
    await client.query(
      `INSERT INTO transactions
         (type, amount_cents, currency, note, vendor_id, user_id, sender_id, recipient_id, created_at)
       VALUES
         ('debit', $1, $2, $3, $4, $5, $6, $7, ${nowSql})`,
      [cents, currency, note || null, vendor.vendor_id, buyer.user_id, buyer.user_id, vendorUserId]
    );

    // vendor: credit
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
  } finally {
    try { client.release(); } catch {}
  }
});

module.exports = router;
