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

// Get user ID from URL
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

// Form elements
const form = document.getElementById("editForm");
const statusMsg = document.getElementById("statusMsg");

const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const roleInput = document.getElementById("role");
const walletAddressInput = document.getElementById("walletAddress");

// Load current user data
async function loadUserData() {
  try {
    const docRef = doc(db, "users", uid);
    const userSnap = await getDoc(docRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      firstNameInput.value = data.firstName || "";
      lastNameInput.value = data.lastName || "";
      roleInput.value = data.role || "";
      walletAddressInput.value = data.walletAddress || "";
    } else {
      statusMsg.textContent = "❌ User not found.";
      statusMsg.style.color = "red";
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    statusMsg.textContent = "❌ Failed to load user data.";
    statusMsg.style.color = "red";
  }
}

// Save updates
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusMsg.textContent = "Saving changes...";

  try {
    const updates = {
      firstName: firstNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      role: roleInput.value.trim(),
      walletAddress: walletAddressInput.value.trim()
    };

    await updateDoc(doc(db, "users", uid), updates);
    statusMsg.textContent = "✅ Profile updated.";
    statusMsg.style.color = "green";

  } catch (error) {
    console.error("Error updating profile:", error);
    statusMsg.textContent = "❌ Update failed.";
    statusMsg.style.color = "red";
  }
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUserData();
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
