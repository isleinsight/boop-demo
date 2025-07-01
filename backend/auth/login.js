// backend/login.js

// const pool = require('./db'); // 🚫 Disable DB temporarily
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Dummy handler to avoid database usage for now
module.exports = async function (req, res) {
  // This lets the server boot and respond without crashing
  const dummyUser = {
    id: 1,
    role: 'test',
  };

  const token = jwt.sign(
    { userId: dummyUser.id, role: dummyUser.role },
    process.env.JWT_SECRET || 'tempsecret',
    { expiresIn: '1h' }
  );

  res.json({ token, note: 'This is a dummy token – DB connection disabled.' });
};
