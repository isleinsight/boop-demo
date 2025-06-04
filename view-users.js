import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  limit,
  startAfter
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

let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 10;

const tableBody = document.getElementById("userTableBody");
const userCountSpan = document.getElementById("userCount");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const searchInput = document.getElementById("searchInput");

// Load users after auth state is confirmed
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    try {
      const querySnapshot = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
      allUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      filteredUsers = allUsers;
      updateUserCount();
      renderTable();
    } catch (error) {
      console.error("Error loading users:", error);
    }
  }
});

function updateUserCount() {
  userCountSpan.textContent = `Total Users: ${filteredUsers.length}`;
}

function renderTable() {
  tableBody.innerHTML = "";

  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const usersToShow = filteredUsers.slice(startIndex, endIndex);

  usersToShow.forEach(user => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>${user.addedBy || ""}</td>
      <td>${user.createdAt?.toDate ? user.createdAt.toDate().toLocaleString() : ""}</td>
    `;

    tableBody.appendChild(row);
  });

  paginationInfo.textContent = `Page ${currentPage}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = endIndex >= filteredUsers.length;
}

searchInput.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase();

  filteredUsers = allUsers.filter(user =>
    (user.firstName || "").toLowerCase().includes(query) ||
    (user.lastName || "").toLowerCase().includes(query) ||
    (user.email || "").toLowerCase().includes(query) ||
    (user.role || "").toLowerCase().includes(query) ||
    (user.addedBy || "").toLowerCase().includes(query)
  );

  currentPage = 1;
  updateUserCount();
  renderTable();
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});

nextBtn.addEventListener("click", () => {
  const maxPages = Math.ceil(filteredUsers.length / usersPerPage);
  if (currentPage < maxPages) {
    currentPage++;
    renderTable();
  }
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth)
      .then(() => {
        window.location.href = "index.html";
      })
      .catch((error) => {
        console.error("Logout failed:", error);
        alert("Logout failed.");
      });
  });
}
