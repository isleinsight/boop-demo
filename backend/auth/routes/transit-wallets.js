const express = require('express');
const router = express.Router();
const db = require('../../db');
const crypto = require('crypto');

// ✅ GET /api/transit-wallets/:user_id
// Fetch transit wallet + its cards by user_id
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params;

  if (!user_id) {
    return res.status(400).json({ message: 'Missing user_id' });
  }

  try {
    const walletResult = await db.query(
      'SELECT * FROM transit_wallets WHERE user_id = $1',
      [user_id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({ message: 'No transit wallet found for this user' });
    }

    const wallet = walletResult.rows[0];

    const cardsResult = await db.query(
      'SELECT * FROM transit_cards WHERE transit_wallet_id = $1',
      [wallet.id]
    );

    res.json({ wallet, cards: cardsResult.rows });
  } catch (err) {
    console.error('❌ Error fetching transit wallet:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ✅ POST /api/transit-wallets
// Create a new transit wallet for a user
router.post('/', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'Missing user_id' });
  }

  const id = crypto.randomUUID();

  try {
    await db.query(
      'INSERT INTO transit_wallets (id, user_id, created_at) VALUES ($1, $2, NOW())',
      [id, user_id]
    );

    res.status(201).json({ message: 'Transit wallet created', id });
  } catch (err) {
    console.error('❌ Error creating transit wallet:', err);
    res.status(500).json({ message: 'Error inserting transit wallet into database' });
  }
});

module.exports = router;
