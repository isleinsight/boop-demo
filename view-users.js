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
  doc
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

// DOM Elements
const userTableBody = document.getElementById("userTableBody");
const userCountSpan = document.getElementById("userCount");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const paginationInfo = document.getElementById("paginationInfo");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

let users = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 10;
let currentSortField = null;
let currentSortOrder = "asc";

function renderTable(usersToShow) {
  userTableBody.innerHTML = "";

  usersToShow.forEach((user) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>
        <div class="dropdown">
          <button class="action-btn">Actions ▼</button>
          <div class="dropdown-content">
            <a href="user-profile.html?uid=${user.uid}">View Profile</a>
            <a href="#" onclick="confirmDelete('${user.uid}', '${user.email || ""}')">Delete</a>
          </div>
        </div>
      </td>
    `;
    userTableBody.appendChild(tr);
  });
}

function paginateUsers() {
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  renderTable(paginatedUsers);
  paginationInfo.textContent = `Page ${currentPage} of ${Math.ceil(filteredUsers.length / usersPerPage)}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = endIndex >= filteredUsers.length;
}

function sortUsers(field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
  } else {
    currentSortField = field;
    currentSortOrder = "asc";
  }

  filteredUsers.sort((a, b) => {
    const aVal = a[field]?.toLowerCase?.() || "";
    const bVal = b[field]?.toLowerCase?.() || "";

    if (aVal < bVal) return currentSortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return currentSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  updateSortIndicators();
  currentPage = 1;
  paginateUsers();
}

function updateSortIndicators() {
  document.querySelectorAll("th[data-key]").forEach((th) => {
    const span = th.querySelector(".sort-arrow");
    if (!span) return;

    if (th.dataset.key === currentSortField) {
      span.textContent = currentSortOrder === "asc" ? "▲" : "▼";
    } else {
      span.textContent = "";
    }
  });
}

function filterUsers() {
  const searchValue = searchInput.value.toLowerCase();
  filteredUsers = users.filter(user =>
    (`${user.firstName} ${user.lastName}`.toLowerCase().includes(searchValue)) ||
    (user.email?.toLowerCase().includes(searchValue)) ||
    (user.role?.toLowerCase().includes(searchValue))
  );

  currentPage = 1;
  paginateUsers();
  userCountSpan.textContent = `Total Users: ${filteredUsers.length}`;
}

async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
  filteredUsers = [...users];
  userCountSpan.textContent = `Total Users: ${users.length}`;
  paginateUsers();
}

window.confirmDelete = async function(uid, email) {
  const confirmed = confirm(`Are you sure you want to delete ${email}?`);
  if (confirmed) {
    const typed = prompt('Type "DELETE" to confirm:');
    if (typed === "DELETE") {
      await deleteDoc(doc(db, "users", uid));
      users = users.filter(u => u.uid !== uid);
      filteredUsers = filteredUsers.filter(u => u.uid !== uid);
      paginateUsers();
      userCountSpan.textContent = `Total Users: ${filteredUsers.length}`;
    } else {
      alert("❌ You must type DELETE exactly.");
    }
  }
};

// Event Listeners
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    paginateUsers();
  }
});

nextBtn.addEventListener("click", () => {
  if (currentPage * usersPerPage < filteredUsers.length) {
    currentPage++;
    paginateUsers();
  }
});

searchBtn.addEventListener("click", filterUsers);
searchInput.addEventListener("input", filterUsers);

document.querySelectorAll("th[data-key]").forEach(th => {
  th.addEventListener("click", () => sortUsers(th.dataset.key));
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUsers();
  } else {
    window.location.href = "index.html";
  }
});
