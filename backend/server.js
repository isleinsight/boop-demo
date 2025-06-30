// backend/server.js

const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// ✅ Serve static files from the public folder
app.use(express.static(path.join(__dirname, '../public')));

// ✅ Health check route
app.get('/health', (req, res) => {
  res.send('OK');
});

// ✅ Fallback to index.html if needed (optional)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../public/index.html'));
// });

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
