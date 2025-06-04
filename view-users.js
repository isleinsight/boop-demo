import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 10;

document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ view-users.js loaded");

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      signOut(auth)
        .then(() => (window.location.href = "index.html"))
        .catch((error) => {
          console.error("Logout error:", error);
          alert("Logout failed.");
        });
    });
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Logged in as:", user.email);
      await loadUsers();
      displayUsers();
    } else {
      console.warn("Not logged in. Redirecting...");
      window.location.href = "index.html";
    }
  });

  document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      displayUsers();
    }
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    const maxPage = Math.ceil(filteredUsers.length / usersPerPage);
    if (currentPage < maxPage) {
      currentPage++;
      displayUsers();
    }
  });

  document.getElementById("searchBtn").addEventListener("click", () => {
    const searchTerm = document.getElementById("searchInput").value.trim().toLowerCase();
    filteredUsers = allUsers.filter(user =>
      user.firstName?.toLowerCase().includes(searchTerm) ||
      user.lastName?.toLowerCase().includes(searchTerm) ||
      user.email?.toLowerCase().includes(searchTerm)
    );
    currentPage = 1;
    displayUsers();
  });
});

async function loadUsers() {
  try {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredUsers = allUsers;
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

function displayUsers() {
  const tableBody = document.getElementById("userTableBody");
  const userCount = document.getElementById("userCount");
  const paginationInfo = document.getElementById("paginationInfo");

  if (!tableBody) return;

  tableBody.innerHTML = "";

  const start = (currentPage - 1) * usersPerPage;
  const end = start + usersPerPage;
  const pageUsers = filteredUsers.slice(start, end);

  pageUsers.forEach(user => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td><a href="view-user.html?id=${user.id}" class="view-button">View / Modify</a></td>
    `;
    tableBody.appendChild(row);
  });

  userCount.textContent = `Total Users: ${filteredUsers.length}`;
  paginationInfo.textContent = `Page ${currentPage} of ${Math.ceil(filteredUsers.length / usersPerPage)}`;
  document.getElementById("prevBtn").disabled = currentPage === 1;
  document.getElementById("nextBtn").disabled = currentPage >= Math.ceil(filteredUsers.length / usersPerPage);
}
