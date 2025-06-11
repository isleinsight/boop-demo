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
  orderBy,
  limit,
  startAfter,
  doc,
  addDoc,
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

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const userTableBody = document.getElementById("userTableBody");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const logoutBtn = document.getElementById("logoutBtn");
const paginationInfo = document.getElementById("paginationInfo");
const userCount = document.getElementById("userCount");

let users = [];
let currentPage = 1;
const usersPerPage = 20;

// Authentication check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUsers();
  } else {
    window.location.href = "index.html";
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Load users from Firestore
async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  users = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  userCount.textContent = `Total Users: ${users.length}`;
  renderPage(1);
}

// Render specific page
function renderPage(page) {
  currentPage = page;
  const start = (page - 1) * usersPerPage;
  const end = start + usersPerPage;
  const pageUsers = users.slice(start, end);

  userTableBody.innerHTML = "";
  pageUsers.forEach(user => {
    const row = document.createElement("tr");

    const isSuspended = user.disabled === true;

    row.innerHTML = `
      <td><input type="checkbox" class="userCheckbox" data-id="${user.id}" /></td>
      <td>${user.firstName || "-"}</td>
      <td>${user.lastName || "-"}</td>
      <td>${user.email || "-"}</td>
      <td>${user.role || "-"}</td>
      <td>
        ${isSuspended
          ? `<span class="badge badge-danger">Suspended</span>
             <button class="btn-unsuspend" onclick="handleUnsuspend('${user.id}')">Reinstate</button>`
          : `<div class="dropdown">
               <button class="action-btn">Actions</button>
               <div class="dropdown-content">
                 <a href="user-profile.html?uid=${user.id}">View Profile</a>
                 <a href="#" onclick="handleSuspend('${user.id}')">Suspend</a>
                 <a href="#" onclick="handleForceSignOut('${user.id}')">Force Sign Out</a>
                 <a href="#" onclick="handleDelete('${user.id}')">Delete</a>
               </div>
             </div>`}
      </td>
    `;
    userTableBody.appendChild(row);
  });

  paginationInfo.textContent = `Page ${currentPage}`;
}

// Pagination buttons
document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentPage > 1) renderPage(currentPage - 1);
});

document.getElementById("nextBtn").addEventListener("click", () => {
  const maxPage = Math.ceil(users.length / usersPerPage);
  if (currentPage < maxPage) renderPage(currentPage + 1);
});

// Search
searchBtn.addEventListener("click", () => {
  const term = searchInput.value.toLowerCase();
  const filtered = users.filter(user =>
    (user.firstName + " " + user.lastName + " " + user.email).toLowerCase().includes(term)
  );
  users = filtered;
  renderPage(1);
});

// Admin action handlers
window.handleSuspend = async (userId) => {
  await triggerAdminAction(userId, "suspend");
  alert("User suspended.");
  await loadUsers();
};

window.handleUnsuspend = async (userId) => {
  await triggerAdminAction(userId, "unsuspend");
  alert("User reinstated.");
  await loadUsers();
};

window.handleDelete = async (userId) => {
  if (confirm("Are you sure you want to delete this user?")) {
    await triggerAdminAction(userId, "delete");
    alert("User deleted.");
    await loadUsers();
  }
};

window.handleForceSignOut = async (userId) => {
  await triggerAdminAction(userId, "forceSignout");
  alert("User will be signed out on all devices.");
};

// Firestore write to adminActions collection
async function triggerAdminAction(userId, actionType) {
  const adminActionsRef = collection(db, "adminActions");
  await addDoc(adminActionsRef, {
    userId,
    action: actionType,
    timestamp: new Date()
  });
}
