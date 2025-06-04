// user-profile.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", async () => {
  const logoutBtn = document.getElementById("logoutBtn");
  const profileContainer = document.getElementById("profileContainer");
  const statusMessage = document.getElementById("statusMessage");

  let adminEmail = null;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      adminEmail = user.email;
      console.log("Admin logged in:", adminEmail);
    } else {
      console.warn("Not logged in. Redirecting...");
      window.location.href = "index.html";
    }
  });

  // Extract UID from query parameter
  const params = new URLSearchParams(window.location.search);
  const uid = params.get("uid");

  if (!uid) {
    statusMessage.textContent = "No user ID provided in the URL.";
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, "users", uid));

    if (!userDoc.exists()) {
      statusMessage.textContent = "User not found.";
      return;
    }

    const data = userDoc.data();

    profileContainer.innerHTML = `
      <h2>${data.firstName} ${data.lastName}</h2>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Role:</strong> ${data.role}</p>
      <p><strong>Wallet ID:</strong> ${data.walletId || 'N/A'}</p>
      <p><strong>Added By:</strong> ${data.addedBy}</p>
      <p><strong>Created At:</strong> ${data.createdAt?.toDate().toLocaleString() || 'N/A'}</p>
    `;

  } catch (error) {
    console.error("Error fetching user profile:", error);
    statusMessage.textContent = "Error loading user profile.";
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      signOut(auth)
        .then(() => {
          window.location.href = "index.html";
        })
        .catch((error) => {
          console.error("Logout error:", error);
          alert("Logout failed.");
        });
    });
  }
});
