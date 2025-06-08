const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Read service account JSON from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const MASTER_DELETE_SECRET = 'boopSecret123'; // Change this later to a secret too if needed

// ========== ROUTES ==========

// Root check
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
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Failed to delete user.', error: error.message });
  }
});

// Disable user (suspend)
app.post('/suspend-user', async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.updateUser(uid, { disabled: true });
    res.status(200).json({ message: `User ${uid} suspended.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to suspend user.', error: error.message });
  }
});

// Enable user (unsuspend)
app.post('/unsuspend-user', async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.updateUser(uid, { disabled: false });
    res.status(200).json({ message: `User ${uid} unsuspended.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to unsuspend user.', error: error.message });
  }
});

// Force sign out (revoke tokens)
app.post('/force-signout', async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.revokeRefreshTokens(uid);
    res.status(200).json({ message: `User ${uid} signed out from all devices.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to sign out user.', error: error.message });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
