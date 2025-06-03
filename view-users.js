// view-users.js

// Import Firebase SDK modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Get reference to the table and pagination button
const tableBody = document.querySelector("#userTableBody");
const pagination = document.querySelector("#pagination");

let lastVisible = null;
let isLoading = false;

// Check if user is authenticated
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUsers(); // Load users once logged in
  } else {
    window.location.href = "index.html"; // Redirect if not logged in
  }
});

// Load users from Firestore
async function loadUsers(nextPage = false) {
  if (isLoading) return;
  isLoading = true;
  tableBody.innerHTML = "";

  let q;
  if (nextPage && lastVisible) {
    q = query(
      collection(db, "users"),
      orderBy("createdAt", "desc"),
      startAfter(lastVisible),
      limit(20)
    );
  } else {
    q = query(
      collection(db, "users"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
  }

  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    lastVisible = snapshot.docs[snapshot.docs.length - 1];
    snapshot.forEach((doc) => {
      const user = doc.data();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.firstName || ""}</td>
        <td>${user.lastName || ""}</td>
        <td>${user.email || ""}</td>
        <td>${user.role || ""}</td>
        <td>${user.walletAddress || ""}</td>
        <td>${user.addedBy || ""}</td>
      `;
      tableBody.appendChild(row);
    });
  } else {
    const row = document.createElement("tr");
    row.innerHTML = "<td colspan='6'>No users found.</td>";
    tableBody.appendChild(row);
  }

  isLoading = false;
}

// Optional: Add a button to load more users
if (pagination) {
  pagination.addEventListener("click", () => {
    loadUsers(true);
  });
}

// Logout handler
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
