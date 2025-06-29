// Load environment variables
require('dotenv').config();

// Import modules
const express = require('express');
const cors = require('cors');
const path = require('path');
const loginHandler = require('./login'); // Using login.js from backend

// Initialize app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from /public
app.use(express.static(path.join(__dirname, '../public'))); // ✅ This line serves public HTML/CSS/JS

// API routes
app.use('/api', loginHandler); // POST /api/login

// Fallback to index.html for any unknown routes (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
