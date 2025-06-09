const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const auth = admin.auth();
const MASTER_DELETE_SECRET = "boopSecret123"; // Replace with env var later if needed

exports.adminUserActions = functions.https.onRequest(async (req, res) => {
  const { uid, secret, action } = req.body;

  if (secret !== MASTER_DELETE_SECRET) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    switch (action) {
      case "delete":
        await auth.deleteUser(uid);
        return res.json({ message: `User ${uid} deleted.` });

      case "suspend":
        await auth.updateUser(uid, { disabled: true });
        return res.json({ message: `User ${uid} suspended.` });

      case "unsuspend":
        await auth.updateUser(uid, { disabled: false });
        return res.json({ message: `User ${uid} unsuspended.` });

      case "signout":
        await auth.revokeRefreshTokens(uid);
        return res.json({ message: `User ${uid} signed out from all devices.` });

      default:
        return res.status(400).json({ message: "Invalid action." });
    }
  } catch (error) {
    console.error("Admin action failed:", error);
    return res.status(500).json({ message: error.message });
  }
});
