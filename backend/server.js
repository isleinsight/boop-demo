const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080; // Firebase requires port 8080

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Firebase Admin SDK using application default credentials
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const auth = admin.auth();

const MASTER_DELETE_SECRET = 'boopSecret123'; // Protects your endpoints

// ===== ROUTES =====

// Test route
app.get('/', (req, res) => {
  res.send('✅ BOOP Admin Microservice is running securely!');
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
    res.status(500).json({ message: 'Failed to delete user.', error: error.message });
  }
});

// Disable (suspend) user
app.post('/disable-user', async (req, res) => {
  const { uid, secret } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.updateUser(uid, { disabled: true });
    res.status(200).json({ message: `User ${uid} has been suspended.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to suspend user.', error: error.message });
  }
});

// Enable (unsuspend) user
app.post('/enable-user', async (req, res) => {
  const { uid, secret } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.updateUser(uid, { disabled: false });
    res.status(200).json({ message: `User ${uid} has been re-enabled.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to re-enable user.', error: error.message });
  }
});

// Force sign out user from all devices
app.post('/force-signout', async (req, res) => {
  const { uid, secret } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await auth.revokeRefreshTokens(uid);
    res.status(200).json({ message: `User ${uid} has been signed out from all devices.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to revoke sessions.', error: error.message });
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
