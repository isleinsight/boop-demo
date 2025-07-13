const express = require('express');
const router = express.Router();
const db = require('../../db'); // Adjust based on your folder structure

// GET: Fetch transit wallet and its cards by user_id
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params;

  try {
    const walletResult = await db.query(
      'SELECT * FROM transit_wallets WHERE user_id = $1',
      [user_id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({ message: 'No transit wallet found' });
    }

    const transitWallet = walletResult.rows[0];

    const cardsResult = await db.query(
      'SELECT * FROM transit_cards WHERE transit_wallet_id = $1',
      [transitWallet.id]
    );

    res.json({ wallet: transitWallet, cards: cardsResult.rows });
  } catch (err) {
    console.error('🚨 Error in GET /transit-wallets/:user_id:', err);
    res.status(500).json({ message: 'Server error fetching transit wallet' });
  }
});

module.exports = router;
