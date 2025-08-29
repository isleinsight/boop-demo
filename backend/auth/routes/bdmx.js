// replace backend/auth/routes/bmdx.js with a minimal router
// cat >/root/boop-demo/backend/auth/routes/bmdx.js <<'EOF'
const express = require('express');
const router = express.Router();

// prove this exact file loaded
console.log('[bdmx] router loaded (minimal)');

router.get('/', (_req,res) => {
  res.json({ ok: true, from: 'bdmx index' });
});

router.get('/ping', (_req,res) => {
  res.json({ ok: true, from: 'bdmx/ping' });
});

module.exports = router;
EOF
