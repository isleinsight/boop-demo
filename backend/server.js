// Load environment variables
require('dotenv').config();

// Import modules
const express = require('express');
const cors = require('cors');
const loginHandler = require('./login'); // ✅ Renamed for clarity

// Initialize app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', loginHandler); // ✅ Now matches the renamed backend file

// Root endpoint
app.get('/', (req, res) => {
  res.send('BOOP API is live!');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
