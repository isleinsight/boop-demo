import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Pagination state
let lastVisibleUser = null;
let currentPage = 1;
const usersPerPage = 20;

// Load Users on Auth State
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUsers();
  } else {
    window.location.href = "index.html";
  }
});

// Load users from Firestore
async function loadUsers() {
  try {
    const tableBody = document.getElementById("userTableBody");
    if (!tableBody) {
      console.error("Table body with ID 'userTableBody' not found.");
      return;
    }

    tableBody.innerHTML = ""; // Clear previous data

    let userQuery = query(
      collection(db, "users"),
      orderBy("firstName"),
      limit(usersPerPage)
    );

    if (lastVisibleUser) {
      userQuery = query(userQuery, startAfter(lastVisibleUser));
    }

    const snapshot = await getDocs(userQuery);

    snapshot.forEach(doc => {
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

    if (!snapshot.empty) {
      lastVisibleUser = snapshot.docs[snapshot.docs.length - 1];
    }

  } catch (error) {
    console.error("Error loading users:", error);
  }
}

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "index.html";
    });
  });
}
