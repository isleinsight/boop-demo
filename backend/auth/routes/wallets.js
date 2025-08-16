// ./auth/routes/wallets.js
const express = require("express");
const router = express.Router();
const db = require("../../db");
const { authenticateToken } = require("../middleware/authMiddleware");

function isAdmin(req) {
  return (req.user?.role || "").toLowerCase() === "admin";
}

// ✅ TEMP: quick health checks to verify mounting & path
router.get("/ping", (_req, res) => res.json({ ok: true, scope: "wallets" }));
router.get("/user/test", (_req, res) =>
  res.json({ ok: true, route: "/api/wallets/user/:userId" })
);

// ✅ Your schema: student_parents(student_id, parent_id)
// student_id == student's users.id (same as students.user_id)
async function parentLinkedToStudent(parentId, studentUserId) {
  const q = `
    SELECT 1
    FROM student_parents
    WHERE student_id = $1 AND parent_id = $2
    LIMIT 1
  `;
  const { rows } = await db.query(q, [studentUserId, parentId]);
  return rows.length > 0;
}

/**
 * GET /api/wallets/mine — (unchanged)
 * returns: { wallet_id, balance_cents }
 */
router.get("/mine", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) return res.status(400).json({ message: "No user id in token." });

    const q = `
      SELECT id, balance
      FROM wallets
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);

    if (!rows.length) return res.json({ wallet_id: null, balance_cents: 0 });

    const w = rows[0];
    return res.json({ wallet_id: w.id, balance_cents: Number(w.balance || 0) });
  } catch (err) {
    console.error("❌ wallets/mine error:", err.stack || err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

/**
 * GET /api/wallets/user/:userId
 * Admin OR parent linked to that student.
 * Response: { wallet_id, balance_cents }
 */
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Auth: admin ok; otherwise must be a parent linked to this student
    if (!isAdmin(req)) {
      const requesterId = req.user?.userId ?? req.user?.id;
      const role = (req.user?.role || "").toLowerCase();
      if (role !== "parent") {
        return res.status(403).json({ message: "Admin or linked parent required." });
      }
      const linked = await parentLinkedToStudent(requesterId, userId);
      if (!linked) {
        return res.status(403).json({ message: "Not authorized for this student." });
      }
    }

    const q = `
      SELECT id, balance
      FROM wallets
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);

    if (!rows.length) return res.json({ wallet_id: null, balance_cents: 0 });

    const w = rows[0];
    return res.json({ wallet_id: w.id, balance_cents: Number(w.balance || 0) });
  } catch (err) {
    console.error("❌ wallets/user/:userId error:", err);
    return res.status(500).json({ message: "Failed to load wallet." });
  }
});

// --- Parent-funded top-ups (keeps treasury flow untouched) -------------------
/**
 * POST /api/wallets/:walletId/parent-deposits
 * Body: { amount: number, note?: string, source?: "HSBC" | "BUTTERFIELD" }
 * Double-entry:
 *   Dr Merchant Settlement (asset down)
 *   Cr Student Wallet (liability up)
 */
router.post("/:walletId/parent-deposits", authenticateToken, async (req, res) => {
  const client = await db.connect();
  const where = "POST /api/wallets/:walletId/parent-deposits";
  try {
    const { walletId } = req.params;
    const { amount, note, source } = req.body;

    // 1) Validate amount
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Invalid amount." });
    }
    const amount_cents = Math.round(amt * 100);

    // 2) Pick merchant settlement wallet from env
    const pick = String(source || "").toUpperCase();
    const MERCH_HSBC = process.env.MERCHANT_WALLET_ID_HSBC;
    const MERCH_BUTT = process.env.MERCHANT_WALLET_ID_BUTTERFIELD; // optional, if you add one later
    const merchantWalletId =
      (pick === "BUTTERFIELD" ? MERCH_BUTT : MERCH_HSBC) || MERCH_BUTT || MERCH_HSBC;

    if (!merchantWalletId) {
      console.error(`${where}: ❌ Missing MERCHANT_WALLET_ID_* env`);
      return res.status(500).json({ message: "Merchant settlement wallet not configured." });
    }

    // 3) Load destination (student) wallet
    const destRes = await client.query(
      `SELECT id, user_id, balance FROM wallets WHERE id = $1`,
      [walletId]
    );
    if (!destRes.rowCount) {
      return res.status(404).json({ message: "Wallet not found." });
    }
    const studentWallet = destRes.rows[0];
    const studentUserId = studentWallet.user_id;

    // 4) Authorize: admin or linked parent
    const callerId = req.user?.userId ?? req.user?.id;
    const role = (req.user?.role || "").toLowerCase();
    let allowed = role === "admin";
    if (!allowed && role === "parent") {
      const link = await db.query(
        `SELECT 1 FROM student_parents WHERE student_id = $1 AND parent_id = $2 LIMIT 1`,
        [studentUserId, callerId]
      );
      allowed = link.rowCount > 0;
    }
    if (!allowed) {
      return res.status(403).json({ message: "Not authorized to deposit to this wallet." });
    }

    // 5) Load merchant settlement wallet
    const merchRes = await client.query(
      `SELECT id, user_id, balance FROM wallets WHERE id = $1`,
      [merchantWalletId]
    );
    if (!merchRes.rowCount) {
      return res.status(500).json({ message: "Merchant settlement wallet not found." });
    }
    const merchantWallet = merchRes.rows[0];
    if (!merchantWallet.user_id) {
      return res.status(500).json({ message: "Merchant wallet misconfigured (no user_id)." });
    }

    // 6) Post double-entry
    await client.query("BEGIN");

    const reference_code = `PARENT_TOPUP:${Date.now()}:${studentWallet.id}:${amount_cents}`;

    // DEBIT merchant (money leaves merchant → to student)
    const debitTx = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, method, created_at,
         added_by, sender_id, recipient_id, reference_code, metadata
       ) VALUES ($1, $2, 'debit', $3, $4, 'internal', NOW(),
                 $5, $2, $6, $7, jsonb_build_object('kind','parent_topup'))
       RETURNING id`,
      [
        merchantWallet.id,
        merchantWallet.user_id,
        amount_cents,
        note || 'Parent top-up',
        callerId,
        studentUserId,
        reference_code
      ]
    );

    // CREDIT student
    const creditTx = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, method, created_at,
         added_by, sender_id, recipient_id, reference_code, metadata
       ) VALUES ($1, $2, 'credit', $3, $4, 'internal', NOW(),
                 $5, $6, $2, $7, jsonb_build_object('kind','parent_topup'))
       RETURNING id`,
      [
        studentWallet.id,
        studentUserId,
        amount_cents,
        note || 'Top-up received',
        callerId,
        merchantWallet.user_id,
        reference_code
      ]
    );

    // 7) Update balances
    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
      [amount_cents, merchantWallet.id]
    );
    const newBalRes = await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2 RETURNING balance`,
      [amount_cents, studentWallet.id]
    );

    await client.query("COMMIT");
    return res.status(200).json({
      success: true,
      wallet_id: studentWallet.id,
      balance_cents: Number(newBalRes.rows[0].balance || 0),
      transaction_ids: { debit: debitTx.rows[0].id, credit: creditTx.rows[0].id },
      reference_code
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ parent-deposits error:", err);
    return res.status(500).json({ message: err.message || "Failed to add funds." });
  } finally {
    client.release();
  }
});

module.exports = router;
