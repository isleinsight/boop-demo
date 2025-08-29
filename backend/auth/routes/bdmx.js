cat >/root/boop-demo/backend/auth/routes/bmdx.js <<'EOF'
const express = require('express');
const router = express.Router();

// replies at /api/bmdx/  (exactly this path)
router.get('/', (_req, res) => {
  res.json({ ok: true, where: '/api/bmdx/' });
});

// replies at /api/bmdx/ping
router.get('/ping', (_req, res) => {
  res.json({ ok: true, ping: 'pong' });
});

module.exports = router;
EOF

# restart
pm2 restart all
