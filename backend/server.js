// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const loginRoute = require('./login');
app.use('/api', loginRoute);
const app = express();

// Load environment variables
dotenv.config();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(loginRoute); // Mount the login API route

// Test route
app.get('/', (req, res) => {
  res.send('BOOP API is live!');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
