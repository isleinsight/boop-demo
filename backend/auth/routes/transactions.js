const express = require("express");
const router = express.Router();
const pool = require("../../db");
const authenticateToken = require("../middleware/authMiddleware");

// ✅ Get all transactions (with filters & pagination)
router.get("/", authenticateToken, async (req, res) => {
  const { user_id, vendor_id, card_id, type, category, page = 1, perPage = 10 } = req.query;
  const values = [];
  const whereClauses = [];

  if (user_id) {
    values.push(user_id);
    whereClauses.push(`user_id = $${values.length}`);
  }

  if (vendor_id) {
    values.push(vendor_id);
    whereClauses.push(`vendor_id = $${values.length}`);
  }

  if (card_id) {
    values.push(card_id);
    whereClauses.push(`card_id = $${values.length}`);
  }

  if (type) {
    values.push(type);
    whereClauses.push(`type = $${values.length}`);
  }

  if (category) {
    values.push(category);
    whereClauses.push(`category = $${values.length}`);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const limit = parseInt(perPage);
  const offset = (parseInt(page) - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT * FROM transactions
       ${whereSQL}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM transactions ${whereSQL}`,
      values
    );

    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    res.json({
      transactions: result.rows,
      total,
      totalPages
    });
  } catch (err) {
    console.error("❌ Error fetching transactions:", err);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
});

// ✅ Get single transaction
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM transactions WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching transaction:", err);
    res.status(500).json({ message: "Failed to fetch transaction" });
  }
});

// ✅ Create transaction
router.post("/", authenticateToken, async (req, res) => {
  const {
    user_id,
    card_id,
    vendor_id,
    amount_cents,
    currency,
    type,
    category,
    reference_code,
    metadata
  } = req.body;

  if (!user_id || !amount_cents || !currency || !type) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO transactions (
        user_id, card_id, vendor_id, amount_cents,
        currency, type, category, reference_code, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        user_id,
        card_id || null,
        vendor_id || null,
        amount_cents,
        currency,
        type,
        category || null,
        reference_code || null,
        metadata || {}
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating transaction:", err);
    res.status(500).json({ message: "Failed to create transaction" });
  }
});

module.exports = router;
