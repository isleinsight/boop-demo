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

/**
 * POST /api/wallets/:walletId/deposits
 * Body: { amount: number (BMD), note?: string, source?: "HSBC" | "BUTTERFIELD" }
 * Auth: admin OR parent linked to the wallet owner (student)
 * Effects (double-entry):
 *  - INSERT transactions(type='debit',  wallet=treasury, amount_cents=+)
 *  - INSERT transactions(type='credit', wallet=student,  amount_cents=+)
 *  - UPDATE treasury.balance -= amount_cents
 *  - UPDATE student.balance  += amount_cents
 * Returns: { success, wallet_id, balance_cents, transaction_ids: { debit, credit } }
 */
router.post("/:walletId/deposits", authenticateToken, async (req, res) => {
  const client = await db.connect();
  try {
    const { walletId } = req.params;
    const { amount, note, source } = req.body;

    // --- validate amount ---
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Invalid amount." });
    }
    const amount_cents = Math.round(amt * 100);

    // --- resolve treasury wallet id from env ---
    // default to HSBC; allow override via body.source
    const treasuryWalletId =
      (String(source || "").toUpperCase() === "BUTTERFIELD"
        ? process.env.TREASURY_WALLET_ID_BUTTERFIELD
        : process.env.TREASURY_WALLET_ID_HSBC) || process.env.TREASURY_WALLET_ID_BUTTERFIELD;

    if (!treasuryWalletId) {
      return res.status(500).json({ message: "Treasury wallet not configured." });
    }

    // --- load destination (student) wallet + owner ---
    const destRes = await client.query(
      `SELECT id, user_id, balance FROM wallets WHERE id = $1`,
      [walletId]
    );
    if (!destRes.rowCount) return res.status(404).json({ message: "Wallet not found." });

    const studentWallet = destRes.rows[0];
    const studentUserId = studentWallet.user_id;

    // --- authorization: admin OR linked parent ---
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

    // --- load treasury wallet + ensure sufficient funds (optional) ---
    const treasRes = await client.query(
      `SELECT id, user_id, balance FROM wallets WHERE id = $1`,
      [treasuryWalletId]
    );
    if (!treasRes.rowCount) return res.status(500).json({ message: "Treasury wallet not found." });
    const treasuryWallet = treasRes.rows[0];

    // If you want to enforce positive treasury balance:
    // if (Number(treasuryWallet.balance) < amount_cents) {
    //   return res.status(400).json({ message: "Treasury balance insufficient." });
    // }

    await client.query("BEGIN");

    // Shared reference for audit linking (idempotency key could go here)
    const reference_code = `TOPUP:${Date.now()}:${studentWallet.id}:${amount_cents}`;

    // 1) DEBIT treasury (money leaves treasury)
    const debitTx = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, method, created_at,
         added_by, sender_id, recipient_id, reference_code, metadata
       ) VALUES ($1, $2, 'debit', $3, $4, 'internal', NOW(),
                 $5, $2, $6, $7, jsonb_build_object('kind','treasury_topup'))
       RETURNING id`,
      [
        treasuryWallet.id,
        treasuryWallet.user_id,         // user whose wallet is debited
        amount_cents,
        note || 'Parent top-up',
        callerId,
        studentUserId,                  // recipient is the student
        reference_code
      ]
    );

    // 2) CREDIT student (money arrives to student)
    const creditTx = await client.query(
      `INSERT INTO transactions (
         wallet_id, user_id, type, amount_cents, note, method, created_at,
         added_by, sender_id, recipient_id, reference_code, metadata
       ) VALUES ($1, $2, 'credit', $3, $4, 'internal', NOW(),
                 $5, $6, $2, $7, jsonb_build_object('kind','treasury_topup'))
       RETURNING id`,
      [
        studentWallet.id,
        studentUserId,                  // user whose wallet is credited
        amount_cents,
        note || 'Top-up received',
        callerId,
        treasuryWallet.user_id,         // sender is treasury user
        reference_code
      ]
    );

    // 3) Update balances (zero-sum)
    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
      [amount_cents, treasuryWallet.id]
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
    console.error("❌ POST /api/wallets/:walletId/deposits (double-entry):", err);
    return res.status(500).json({ message: "Failed to add funds." });
  } finally {
    client.release();
  }
});

module.exports = router;
