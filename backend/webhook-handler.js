// backend/webhook-handler.js
const express = require('express');
const router = express.Router();

// GitHub webhook endpoint
router.post('/webhook', express.json({ type: '*/*' }), (req, res) => {
  console.log('🚀 Webhook received:', req.body);

  // Optionally: auto-pull changes
  const { exec } = require('child_process');
  exec('cd /root/boop-demo && git pull', (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Git pull error:', stderr);
      return res.status(500).send('Git pull failed');
    }
    console.log('✅ Git pull output:', stdout);
    res.status(200).send('Webhook handled');
  });
});

module.exports = router;
