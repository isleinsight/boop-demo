// backend/server.js

const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ✅ SERVE PUBLIC FOLDER
app.use(express.static(path.join(__dirname, '../public')));

// ✅ Optional health check
app.get('/health', (req, res) => {
  res.send('OK');
});

// ✅ Optional catch-all (comment out if unnecessary)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../public/index.html'));
// });

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
