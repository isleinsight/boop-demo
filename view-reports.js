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
  deleteDoc,
  doc,
  updateDoc,
  addDoc
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

const tableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const rowsPerPage = 10;

function renderTable(users) {
  const start = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = users.slice(start, start + rowsPerPage);
  tableBody.innerHTML = "";

  paginatedUsers.forEach((user) => {
    const row = document.createElement("tr");

    const suspensionBadge = user.suspended
      ? `<span class="badge badge-danger">Suspended</span>`
      : "";

    row.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>${suspensionBadge}</td>
      <td>
        <a href="user-profile.html?uid=${user.id}">View</a>
      </td>
    `;
    tableBody.appendChild(row);
  });

  document.getElementById("paginationInfo").textContent = `Page ${currentPage} of ${Math.ceil(users.length / rowsPerPage)}`;
  document.getElementById("prevBtn").disabled = currentPage === 1;
  document.getElementById("nextBtn").disabled = start + rowsPerPage >= users.length;
}

function handleSearch() {
  const value = searchInput.value.trim().toLowerCase();
  filteredUsers = allUsers.filter(user =>
    (user.firstName + " " + user.lastName + " " + user.email + " " + user.role)
      .toLowerCase()
      .includes(value)
  );
  currentPage = 1;
  renderTable(filteredUsers);
  userCount.textContent = `Total Users: ${filteredUsers.length}`;
}

document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable(filteredUsers);
  }
});

document.getElementById("nextBtn").addEventListener("click", () => {
  if ((currentPage * rowsPerPage) < filteredUsers.length) {
    currentPage++;
    renderTable(filteredUsers);
  }
});

searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("input", handleSearch);

function loadUsers() {
  getDocs(collection(db, "users")).then((snapshot) => {
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredUsers = [...allUsers];
    userCount.textContent = `Total Users: ${filteredUsers.length}`;
    renderTable(filteredUsers);
  }).catch((err) => {
    console.error("Failed to load users:", err);
    alert("Could not load users.");
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUsers();
  } else {
    window.location.href = "index.html";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
