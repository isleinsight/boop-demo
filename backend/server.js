const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Create Express app
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Load service account credentials from JSON file
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();

// Master secret for admin-only actions
const MASTER_DELETE_SECRET = 'boopSecret123';

// === ROUTES ===

// Health check
app.get('/', (req, res) => {
  res.send('BOOP Admin Microservice is running!');
});

// Delete user
app.post('/delete-user', async (req, res) => {
  const { uid, secret } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.deleteUser(uid);
    res.status(200).json({ message: `User ${uid} successfully deleted.` });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user.', error: error.message });
  }
});

// Disable (suspend) a user
app.post('/suspend-user', async (req, res) => {
  const { uid, secret } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.updateUser(uid, { disabled: true });
    res.status(200).json({ message: `User ${uid} has been suspended.` });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ message: 'Failed to suspend user.', error: error.message });
  }
});

// Enable (unsuspend) a user
app.post('/unsuspend-user', async (req, res) => {
  const { uid, secret } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.updateUser(uid, { disabled: false });
    res.status(200).json({ message: `User ${uid} has been unsuspended.` });
  } catch (error) {
    console.error('Error unsuspending user:', error);
    res.status(500).json({ message: 'Failed to unsuspend user.', error: error.message });
  }
});

// Force sign-out from all devices
app.post('/force-signout', async (req, res) => {
  const { uid, secret } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.revokeRefreshTokens(uid);
    res.status(200).json({ message: `User ${uid} has been signed out from all devices.` });
  } catch (error) {
    console.error('Error signing out user:', error);
    res.status(500).json({ message: 'Failed to sign out user.', error: error.message });
  }
});

// === START SERVER ===
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
