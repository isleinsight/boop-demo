const express = require("express");
const admin = require("firebase-admin");

const app = express();
app.use(express.json());

// 🔐 Load and decode service account from Base64 secret
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!serviceAccountBase64) {
  throw new Error("🔥 Service account secret is missing. Make sure FIREBASE_SERVICE_ACCOUNT_BASE64 is set.");
}

let serviceAccount;
try {
  const decoded = Buffer.from(serviceAccountBase64, "base64").toString("utf8");
  serviceAccount = JSON.parse(decoded);
} catch (err) {
  console.error("❌ Failed to parse Firebase service account JSON:", err);
  throw err;
}

// ✅ Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const MASTER_DELETE_SECRET = 'boopSecret123'; // You can move this to an env var later

// ========== ROUTES ==========

// Test route
app.get('/', (req, res) => {
  res.send('🔥 BOOP Admin Microservice is running!');
});

// 🔥 Delete user
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

// 🚫 Suspend user
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

// ✅ Unsuspend user
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

// 🔐 Force sign-out (revoke refresh tokens)
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

// 🚀 Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
