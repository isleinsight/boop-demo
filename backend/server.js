// Load environment variables
require('dotenv').config();

// Import modules
const express = require('express');
const cors = require('cors');
const loginRoute = require('./login'); // This is the backend login route

// Initialize app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

//  Serve static files like HTML, CSS, and frontend JS from the "public" folder
app.use(express.static('public'));

//  API Routes
app.use('/api', loginRoute);

// Root endpoint to test if server is live
app.get('/', (req, res) => {
  res.send('BOOP API is live!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
