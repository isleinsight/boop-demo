const express = require('express');
const router = express.Router();
const bmdx = require('../services/bmdx');  // note the path: go UP one folder into services

// test route to check BMDX connection
router.get('/bmdx/health', async (req, res) => {
  try {
    const info = await bmdx.health();
    res.json(info);
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

module.exports = router;
