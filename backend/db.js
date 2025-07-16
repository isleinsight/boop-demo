// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('❌ Missing DATABASE_URL in environment variables.');
}

console.log('🔍 DATABASE_URL =', connectionString);

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Optionally test the connection
pool.connect()
  .then(() => console.log('✅ PostgreSQL pool connected'))
  .catch((err) => console.warn('⚠️ DB connection failed on startup:', err.message));

module.exports = pool;
