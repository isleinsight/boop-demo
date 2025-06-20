I need you to update the force quit function. It’s not working. import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

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

async function requestAdminAction(uid, action) {
  const actionsRef = collection(db, "adminActions");
  const payload = {
    uid: uid,
    action: action,
    timestamp: new Date(),
    status: "pending"
  };
  await addDoc(actionsRef, payload);
  alert(`✅ ${action} request sent. It may take a moment to process.`);
}

let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const rowsPerPage = 10;

const tableBody = document.getElementById("userTableBody");

function renderTable(users) {
  const start = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = users.slice(start, start + rowsPerPage);
  tableBody.innerHTML = "";

  paginatedUsers.forEach((user) => {
    const row = document.createElement("tr");
    const isSuspended = user.suspended === true;

    row.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>
        ${
          isSuspended
            ? `<span class="badge badge-danger">Suspended</span> 
               <button class="btn btn-sm btn-success reinstate-btn" data-id="${user.id}">Reinstate</button>`
            : `<div class="dropdown">
                <button class="action-btn">Actions ▼</button>
                <div class="dropdown-content">
                  <a href="user-profile.html?uid=${user.id}">View Profile</a>
                  <a href="#" class="request-delete" data-id="${user.id}">Delete</a>
                  <a href="#" class="admin-action" data-id="${user.id}" data-action="suspend">Suspend</a>
                  <a href="#" class="admin-action" data-id="${user.id}" data-action="forceSignout">Force Sign Out</a>
                </div>
              </div>`
        }
      </td>
    `;
    tableBody.appendChild(row);
  });

  // Delete
  document.querySelectorAll(".request-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const confirm1 = confirm("Are you sure you want to delete this user?");
      if (!confirm1) return;
      const confirm2 = prompt("Type DELETE to confirm:");
      if (confirm2 !== "DELETE") return alert("Cancelled.");
      await deleteDoc(doc(db, "users", uid));
      await requestAdminAction(uid, "delete");
      loadUsers();
    });
  });

  // Admin action
  document.querySelectorAll(".admin-action").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      if (!confirm(`Are you sure you want to ${action} this user?`)) return;
      await requestAdminAction(uid, action);
    });
  });

  // Reinstate
  document.querySelectorAll(".reinstate-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const uid = btn.getAttribute("data-id");
      if (!confirm("Reinstate this user?")) return;
      await requestAdminAction(uid, "unsuspend");
      loadUsers();
    });
  });
}

function loadUsers() {
  getDocs(collection(db, "users")).then((snapshot) => {
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredUsers = [...allUsers];
    renderTable(filteredUsers);
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
