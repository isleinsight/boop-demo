import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  addDoc // ✅ THIS WAS MISSING
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// UTIL: Admin action Firestore request
async function requestAdminAction(uid, action) {
  const actionsRef = collection(db, "adminActions");
  const payload = {
    uid: uid,
    action: action,
    timestamp: new Date(),
    status: "pending"
  };
  await addDoc(actionsRef, payload);
  alert(`✅ ${action} request sent. It may take a moment to process.`);
}

// ... the rest of your file remains EXACTLY as you had it ...
