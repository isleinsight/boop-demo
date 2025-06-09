const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.handleAdminRequest = functions.firestore
  .document('adminRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { action, uid, requestedBy } = data;

    // Optional: check if `requestedBy` is an admin
    const adminDoc = await admin.firestore().doc(`users/${requestedBy}`).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
      console.log("Unauthorized request");
      return null;
    }

    try {
      if (action === 'delete') {
        await admin.auth().deleteUser(uid);
        console.log(`Deleted user: ${uid}`);
      }
      // You could add suspend/unsuspend too

      // Clean up the request
      await snap.ref.delete();
    } catch (err) {
      console.error("Admin action failed", err);
    }
    return null;
  });
