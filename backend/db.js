// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

let pool;

try {
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE || process.env.DB_NAME, // Support both
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  // Optional: test connection (but don't block boot)
  pool.connect()
    .then(() => console.log('✅ PostgreSQL pool connected'))
    .catch((err) => console.warn('⚠️ DB connection failed on startup:', err.message));
} catch (err) {
  console.error('❌ Failed to configure DB pool:', err.message);
}

module.exports = pool;
