// backend/webhook-handler.js

const express = require('express');
const { exec } = require('child_process');

const router = express.Router();

// ✅ POST /webhook
router.post("/", express.json({ type: '*/*' }), (req, res) => {
  console.log('🚀 Webhook received:', req.body);

  exec('cd /root/boop-demo && git pull && pm2 restart all', (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Git pull error:', stderr);
      return res.status(500).send('Git pull failed');
    }

    console.log('✅ Git pull output:', stdout);
    res.status(200).send('Webhook handled successfully');
  });
});

module.exports = router;
