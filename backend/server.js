const express = require("express");
const admin = require("firebase-admin");
const app = express();
const PORT = 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
app.use(express.json());

// ========== LOAD AND INITIALIZE FIREBASE ADMIN ==========

// Decode and parse base64 secret
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const MASTER_DELETE_SECRET = process.env.MASTER_DELETE_SECRET || 'boopSecret123';

// ========== ROUTES ==========

// Root route for testing
app.get("/", (req, res) => {
  res.send("BOOP Admin Microservice is running!");
});

// Delete user
app.post("/delete-user", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    await auth.deleteUser(uid);
    res.status(200).json({ message: `User ${uid} successfully deleted.` });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Failed to delete user.", error: error.message });
  }
});

// Suspend user
app.post("/suspend-user", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    await auth.updateUser(uid, { disabled: true });
    res.status(200).json({ message: `User ${uid} suspended.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to suspend user.", error: error.message });
  }
});

// Unsuspend user
app.post("/unsuspend-user", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    await auth.updateUser(uid, { disabled: false });
    res.status(200).json({ message: `User ${uid} unsuspended.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to unsuspend user.", error: error.message });
  }
});

// Force signout
app.post("/force-signout", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    await auth.revokeRefreshTokens(uid);
    res.status(200).json({ message: `User ${uid} signed out from all devices.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to sign out user.", error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

console.log('✅ Reached the end of server.js');
