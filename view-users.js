const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.handleAdminAction = functions.firestore
  .document("adminActions/{actionId}")
  .onCreate(async (snap, context) => {
    const actionId = context.params.actionId;
    const { uid, action } = snap.data();

    let result = {
      status: "completed",
      completedAt: admin.firestore.Timestamp.now(),
    };

    try {
      switch (action) {
        case "delete":
          console.log(`Deleting user: ${uid}`);
          await admin.auth().deleteUser(uid);
          break;

        case "suspend":
          console.log(`Suspending user: ${uid}`);
          await admin.auth().updateUser(uid, { disabled: true });
          break;

        case "unsuspend":
          console.log(`Unsuspending user: ${uid}`);
          await admin.auth().updateUser(uid, { disabled: false });
          break;

        case "forceSignout":
          console.log(`Revoking refresh tokens for user: ${uid}`);
          await admin.auth().revokeRefreshTokens(uid);
          break;

        case "resetPassword":
          console.log(`Generating password reset link for user: ${uid}`);
          const user = await admin.auth().getUser(uid);
          const resetLink = await admin.auth().generatePasswordResetLink(user.email);
          result.resetLink = resetLink;
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      console.log(`Action ${action} completed for UID: ${uid}`);
    } catch (error) {
      console.error("Admin action failed:", error);
      result = {
        status: "error",
        errorMessage: error.message,
        failedAt: admin.firestore.Timestamp.now(),
      };
    }

    // Write the result to Firestore
    await db.collection("adminActions").doc(actionId).update(result);
  });
