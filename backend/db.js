// backend/db.js
require('dotenv').config();
const { Pool } = require('pg');

console.log('🔍 Using individual DB credentials from .env');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL pool connected'))
  .catch(err => console.error('❌ DB connection failed:', err.message));

module.exports = pool;
