require("dotenv").config();

const express = require("express");
const router = express.Router();
const db = require("../../db");
const { v4: uuidv4 } = require("uuid");

const {
  authenticateToken,
  requireTreasuryAdmin,
} = require("../middleware/authMiddleware");

const TREASURY_WALLET_ID = process.env.TREASURY_WALLET_ID;
if (!TREASURY_WALLET_ID) {
  console.error("🚨 Missing TREASURY_WALLET_ID in .env");
}

// ✅ GET /api/treasury/balance
router.get(
  "/balance",
  authenticateToken,
  requireTreasuryAdmin,
  async (req, res) => {
    try {
      const { rows } = await db.query(
        "SELECT balance_cents FROM wallets WHERE id = $1",
        [TREASURY_WALLET_ID]
      );

      if (!rows.length) {
        return res.status(404).json({ message: "Treasury wallet not found" });
      }

      res.json({ balance_cents: rows[0].balance_cents });
    } catch (err) {
      console.error("🔥 Error getting balance:", err);
      res.status(500).json({ message: "Failed to fetch balance" });
    }
  }
);

// ✅ POST /api/treasury/adjust
router.post(
  "/adjust",
  authenticateToken,
  requireTreasuryAdmin,
  async (req, res) => {
    const { amount_cents, type, note } = req.body;
    const performedBy = req.user && req.user.id;

    if (!amount_cents || !["credit", "debit"].includes(type) || !note) {
      return res.status(400).json({ message: "Invalid request payload" });
    }

    const operator = type === "credit" ? "+" : "-";

    try {
      await db.query("BEGIN");

      await db.query(
        `UPDATE wallets
         SET balance_cents = balance_cents ${operator} $1
         WHERE id = $2`,
        [amount_cents, TREASURY_WALLET_ID]
      );

      const txnId = uuidv4();
      await db.query(
        `INSERT INTO treasury_transactions 
         (id, wallet_id, amount_cents, type, note, performed_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [txnId, TREASURY_WALLET_ID, amount_cents, type, note, performedBy]
      );

      await db.query("COMMIT");
      res.json({ success: true, txn_id: txnId });
    } catch (err) {
      await db.query("ROLLBACK");
      console.error("🔥 Error adjusting balance:", err);
      res.status(500).json({ message: "Adjustment failed" });
    }
  }
);

module.exports = router;
