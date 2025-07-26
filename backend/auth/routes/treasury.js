const express = require("express");
const router = express.Router();
const db = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

/**
 * GET /api/treasury/wallets
 * Returns all treasury wallets (secured list)
 */
router.get("/wallets", authenticateToken, async (req, res) => {
  const user = req.user;

  if (!user || (user.role !== "admin" && user.type !== "treasury")) {
    return res.status(403).json({ message: "Not authorized" });
  }

  try {
    const result = await db.query(
      `SELECT id, name FROM wallets WHERE type = 'treasury' ORDER BY name`
    );
    res.json(result.rows); // [{ id, name }]
  } catch (err) {
    console.error("❌ Failed to load treasury wallets:", err.message);
    res.status(500).json({ message: "Unable to load treasury wallets" });
  }
});

/**
 * GET /api/treasury/balance/:walletId
 * Returns current balance of a given wallet
 */
router.get("/balance/:walletId", authenticateToken, async (req, res) => {
  const { walletId } = req.params;
  const user = req.user;

  if (!user || (user.role !== "admin" && user.type !== "treasury")) {
    return res.status(403).json({ message: "Not authorized" });
  }

  try {
    const result = await db.query(
      `SELECT balance FROM wallets WHERE id = $1 AND type = 'treasury'`,
      [walletId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    const balance = result.rows[0].balance || 0;
    res.json({ balance });
  } catch (err) {
    console.error("❌ Failed to fetch wallet balance:", err.message);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
});

/**
 * POST /api/treasury/adjust
 * Adds or subtracts funds from a treasury wallet
 */
router.post("/adjust", authenticateToken, async (req, res) => {
  const { wallet_id, amount, note } = req.body;
  const user = req.user;

  if (!wallet_id || typeof amount !== "number" || !note) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (!user || (user.role !== "admin" && user.type !== "treasury")) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Validate wallet type
    const walletCheck = await client.query(
      `SELECT balance FROM wallets WHERE id = $1 AND type = 'treasury'`,
      [wallet_id]
    );
    if (walletCheck.rowCount === 0) {
      throw new Error("Wallet not found or not a treasury wallet");
    }

    const insertTxn = await client.query(
      `INSERT INTO transactions (
        amount,
        from_wallet_id,
        to_wallet_id,
        note,
        created_by,
        category
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'treasury-adjustment'
      ) RETURNING id`,
      [
        Math.abs(amount),
        amount < 0 ? wallet_id : null,
        amount > 0 ? wallet_id : null,
        note,
        user.id
      ]
    );

    const txnId = insertTxn.rows[0].id;

    await client.query(
      `UPDATE wallets
       SET balance = COALESCE(balance, 0) + $1
       WHERE id = $2`,
      [amount, wallet_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Adjustment successful",
      transaction_id: txnId
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Adjustment failed:", err.message);
    return res.status(500).json({ error: "Adjustment failed" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/treasury/transfer-to-user
 * Transfers funds from a treasury wallet to a user wallet by email
 */
router.post("/transfer-to-user", authenticateToken, async (req, res) => {
  const { from_wallet_id, to_email, amount, note, performed_by } = req.body;

  if (!from_wallet_id || !to_email || !amount || amount <= 0 || !note) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  if (!req.user || (req.user.role !== "admin" && req.user.type !== "treasury")) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `SELECT id, wallet_id FROM users WHERE email = $1`,
      [to_email]
    );
    if (userRes.rowCount === 0) {
      throw new Error("Recipient user not found");
    }

    const recipientWalletId = userRes.rows[0].wallet_id;

    const treasuryRes = await client.query(
      `SELECT balance FROM wallets WHERE id = $1 AND type = 'treasury'`,
      [from_wallet_id]
    );
    if (treasuryRes.rowCount === 0) {
      throw new Error("Treasury wallet not found or invalid type");
    }

    const treasuryBalance = parseFloat(treasuryRes.rows[0].balance || 0);
    if (treasuryBalance < amount) {
      throw new Error("Insufficient treasury funds");
    }

    const txn = await client.query(
      `INSERT INTO transactions (
        amount,
        from_wallet_id,
        to_wallet_id,
        note,
        created_by,
        category
      ) VALUES (
        $1, $2, $3, $4, $5, 'treasury-transfer'
      ) RETURNING id`,
      [amount, from_wallet_id, recipientWalletId, note, performed_by]
    );

    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
      [amount, from_wallet_id]
    );

    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
      [amount, recipientWalletId]
    );

    await client.query("COMMIT");

    res.status(200).json({ message: "Transfer complete", transaction_id: txn.rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Transfer failed:", err.message);
    res.status(500).json({ message: err.message || "Transfer failed" });
  } finally {
    client.release();
  }
});

module.exports = router;
