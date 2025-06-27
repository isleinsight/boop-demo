// government-actions.js

import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const db = getFirestore();
const auth = getAuth();

/**
 * Sends an admin action (delete/suspend/etc.) to Firestore
 * @param {string} uid - The Firebase Auth UID of the user to act on
 * @param {string} action - One of: 'delete', 'suspend', 'unsuspend', 'forceSignout'
 */
export async function requestAdminAction(uid, action) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert("You're not logged in.");
      return;
    }

    await addDoc(collection(db, 'adminRequests'), {
      uid,
      action,
      requestedBy: currentUser.email,
      timestamp: serverTimestamp()
    });

    alert(`Request to ${action} user ${uid} has been sent.`);
  } catch (error) {
    console.error("Admin action error:", error);
    alert("Something went wrong. Please try again.");
  }
}
