// backend/auth/cleanupSessions.js
require('dotenv').config();
const pool = require('../db'); // path updated

async function cleanupExpiredSessions() {
  try {
    const result = await pool.query(`
      DELETE FROM jwt_sessions WHERE expires_at < NOW()
    `);
    console.log(`✅ Cleaned up ${result.rowCount} expired session(s).`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error cleaning up sessions:', err.message);
    process.exit(1);
  }
}

cleanupExpiredSessions();
