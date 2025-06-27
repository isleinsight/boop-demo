// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables (e.g., for DB)
require('dotenv').config();

// Connect to PostgreSQL
const pool = require('./db');

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON bodies

// Serve static files from public/
app.use(express.static(path.join(__dirname, '../public')));

// Routes
const loginRoute = require('./auth/login');
const signupRoute = require('./auth/signup'); // If you made it
const userRoutes = require('./routes/users'); // Optional: if you built these
const cardRoutes = require('./routes/cards'); // Optional: if you built these

app.use('/auth/login', loginRoute);
app.use('/auth/signup', signupRoute); // Optional
app.use('/api/users', userRoutes);    // Optional
app.use('/api/cards', cardRoutes);    // Optional

// Fallback for SPA-style routing (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`BOOP backend running on port ${PORT}`);
});
