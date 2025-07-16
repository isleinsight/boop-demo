// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

let pool;

try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  pool.connect()
    .then(() => console.log('✅ PostgreSQL pool connected'))
    .catch((err) => console.warn('⚠️ DB connection failed on startup:', err.message));
} catch (err) {
  console.error('❌ Failed to configure DB pool:', err.message);
}

module.exports = pool;
