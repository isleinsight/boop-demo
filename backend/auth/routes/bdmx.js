cat >/root/boop-demo/backend/auth/routes/bmdx.js <<'EOF'
const express = require('express');
const router = express.Router();

// simplest possible routes to verify mounting works
router.get('/', (_req, res) => res.json({ ok: true, where: '/api/bmdx' }));
router.get('/health', (_req, res) => res.json({ ok: true, where: '/api/bmdx/health' }));

module.exports = router;
EOF
