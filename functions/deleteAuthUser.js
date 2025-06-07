const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  // Optional: Only allow authenticated admins to delete users
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can delete users."
    );
  }

  const uid = data.uid;
  if (!uid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "User ID is required"
    );
  }

  try {
    await admin.auth().deleteUser(uid);
    return { success: true, message: `User ${uid} deleted.` };
  } catch (error) {
    console.error("Error deleting user from Auth:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
