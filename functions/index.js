const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.handleAdminActions = functions.firestore
  .document("adminActions/{actionId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const uid = data.uid;
    const action = data.action;
    const docRef = snap.ref;

    try {
      if (!uid || !action) throw new Error("Missing UID or action.");

      switch (action) {
        case "delete":
          await admin.auth().deleteUser(uid);
          break;
        case "suspend":
          await admin.auth().updateUser(uid, { disabled: true });
          break;
        case "unsuspend":
          await admin.auth().updateUser(uid, { disabled: false });
          break;
        case "forceSignout":
          await admin.auth().revokeRefreshTokens(uid);
          break;
        default:
          throw new Error("Invalid action type.");
      }

      await docRef.update({ status: "done", message: "Action completed" });
    } catch (error) {
      console.error("Admin action failed:", error);
      await docRef.update({ status: "error", message: error.message });
    }
  });
