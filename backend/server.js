// backend/server.js

const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// ✅ This line serves your public folder correctly
app.use(express.static(path.resolve(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.send('OK');
});

// 🧠 Optional fallback route (for SPA routing - leave commented unless needed)
// app.get('*', (req, res) => {
//   res.sendFile(path.resolve(__dirname, '../public/index.html'));
// });

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
