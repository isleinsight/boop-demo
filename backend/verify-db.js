// verify-db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

console.log('🔍 Verifying DB connection with config:', {
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
});

pool.connect()
  .then(() => {
    console.log('✅ Direct DB connection succeeded!');
    return pool.end();
  })
  .catch((err) => {
    console.error('❌ Direct DB connection FAILED:', err.message);
  });
