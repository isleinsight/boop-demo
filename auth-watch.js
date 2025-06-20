import {
  getAuth,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  onSnapshot,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

onAuthStateChanged(auth, (user) => {
  if (user) {
    const userRef = doc(db, "users", user.uid);

    onSnapshot(userRef, async (docSnap) => {
      const data = docSnap.data();
      console.log("📡 Snapshot data for forceSignout:", data);

      if (data?.forceSignout) {
        alert("⚠️ You have been signed out by an admin.");
        await updateDoc(userRef, { forceSignout: false });
        await signOut(auth);
        window.location.href = "index.html";
      }
    });
  }
});
