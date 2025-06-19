import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM references (corrected!)
const userTableBody = document.getElementById("userTableBody");
const logoutBtn = document.getElementById("logoutBtn");

function renderUserRow(doc) {
  const user = doc.data();
  const row = document.createElement("tr");

  row.innerHTML = `
    <td><input type="checkbox" class="user-checkbox" data-id="${doc.id}" /></td>
    <td>${user.firstName || "-"}</td>
    <td>${user.lastName || "-"}</td>
    <td>${user.email || "-"}</td>
    <td>${user.role || "-"}</td>
    <td>${user.status || "-"}</td>
    <td><a href="user-profile.html?uid=${doc.id}">View</a></td>
  `;

  userTableBody.appendChild(row);
}

async function loadUsers() {
  try {
    const snapshot = await getDocs(collection(db, "users"));

    if (snapshot.empty) {
      userTableBody.innerHTML = "<tr><td colspan='7'>No users found.</td></tr>";
      return;
    }

    snapshot.forEach(renderUserRow);
  } catch (error) {
    console.error("Error loading users:", error);
    userTableBody.innerHTML = "<tr><td colspan='7'>Failed to load users.</td></tr>";
  }
}

// Auth check
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadUsers();
  }
});

// Logout
logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => (window.location.href = "index.html"));
});
