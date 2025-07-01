// backend/webhook-handler.js
const express = require('express');
const { exec } = require('child_process');
const router = express.Router();

router.post('/webhook', (req, res) => {
  console.log('🔔 GitHub Webhook triggered');

  exec('cd ~/boop-demo && git pull && pm2 restart all', (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Git pull failed:', stderr);
      return res.status(500).send('Git pull failed');
    }

    console.log('✅ Git pull + restart successful:\n', stdout);
    res.status(200).send('Deployment successful');
  });
});

module.exports = router;
