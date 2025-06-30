// backend/server.js

const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the correct path (../public)
app.use(express.static(path.join(__dirname, '../public')));

// Allow POST and JSON
app.use(express.json());

// Optional health route
app.get('/health', (req, res) => {
  res.send('OK');
});

// Optional fallback (uncomment if using HTML5 routing)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../public/index.html'));
// });

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
