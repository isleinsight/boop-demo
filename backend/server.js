const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const { execSync } = require("child_process");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// ========== DECRYPT SERVICE ACCOUNT ==========

// Decrypt the file at runtime
const password = process.env.DECRYPTION_KEY || "boopKey123";
try {
  execSync(`openssl enc -aes-256-cbc -d -in serviceAccount.enc -pass pass:${password} -out temp_service_account.json`);
} catch (error) {
  console.error("❌ Failed to decrypt service account:", error);
  process.exit(1);
}

// Read decrypted file
const serviceAccount = JSON.parse(fs.readFileSync("temp_service_account.json", "utf8"));

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Optional: Delete temp decrypted file
fs.unlinkSync("temp_service_account.json");

// ========== FIREBASE AUTH TOOLS ==========

const auth = admin.auth();
const MASTER_DELETE_SECRET = process.env.MASTER_DELETE_SECRET || "boopSecret123";

// ========== ROUTES ==========

app.get("/", (req, res) => {
  res.send("🔥 BOOP Admin Microservice is running!");
});

app.post("/delete-user", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) return res.status(403).json({ message: "Unauthorized" });

  try {
    await auth.deleteUser(uid);
    res.status(200).json({ message: `User ${uid} successfully deleted.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user.", error: error.message });
  }
});

app.post("/suspend-user", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) return res.status(403).json({ message: "Unauthorized" });

  try {
    await auth.updateUser(uid, { disabled: true });
    res.status(200).json({ message: `User ${uid} suspended.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to suspend user.", error: error.message });
  }
});

app.post("/unsuspend-user", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) return res.status(403).json({ message: "Unauthorized" });

  try {
    await auth.updateUser(uid, { disabled: false });
    res.status(200).json({ message: `User ${uid} unsuspended.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to unsuspend user.", error: error.message });
  }
});

app.post("/force-signout", async (req, res) => {
  const { uid, secret } = req.body;
  if (secret !== MASTER_DELETE_SECRET) return res.status(403).json({ message: "Unauthorized" });

  try {
    await auth.revokeRefreshTokens(uid);
    res.status(200).json({ message: `User ${uid} signed out from all devices.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to sign out user.", error: error.message });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
