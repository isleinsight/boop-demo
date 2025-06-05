import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Get UID from query string
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

const emailEl = document.getElementById("email");
const firstNameEl = document.getElementById("firstName");
const lastNameEl = document.getElementById("lastName");
const roleEl = document.getElementById("role");
const saveBtn = document.getElementById("saveChanges");

async function loadUserData(uid) {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      emailEl.value = data.email || "";
      firstNameEl.value = data.firstName || "";
      lastNameEl.value = data.lastName || "";
      roleEl.value = data.role || "";
    } else {
      alert("User not found.");
    }
  } catch (err) {
    console.error("Failed to load user:", err);
    alert("Error loading user.");
  }
}

saveBtn.addEventListener("click", async () => {
  try {
    await updateDoc(doc(db, "users", uid), {
      firstName: firstNameEl.value.trim(),
      lastName: lastNameEl.value.trim()
      // Role and email are not editable here
    });

    alert("✅ Profile updated.");
  } catch (err) {
    console.error("❌ Update error:", err);
    alert("Failed to save changes.");
  }
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUserData(uid);
  } else {
    window.location.href = "index.html";
  }
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
