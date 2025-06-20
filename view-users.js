import {
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
  addDoc,
  updateDoc,
  onSnapshot
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

// Toast utility
function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? 'error' : 'success'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Add toast styles
const style = document.createElement("style");
style.textContent = `
.toast {
  position: fixed;
  bottom: 20px;
  left: 20px;
  background-color: #333;
  color: white;
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 9999;
  opacity: 0.9;
}
.toast.success { background-color: #28a745; }
.toast.error { background-color: #dc3545; }
`;
document.head.appendChild(style);

// Admin Action Handler
async function requestAdminAction(uid, action) {
  const user = auth.currentUser;
  if (!user) {
    showToast("Not authenticated.", true);
    return;
  }

  if (action === "forceSignout") {
    try {
      await updateDoc(doc(db, "users", uid), { forceSignout: true });
      showToast("✅ Force Sign Out triggered.");
    } catch (err) {
      console.error(err);
      showToast("❌ Failed to trigger Force Sign Out.", true);
    }
    return;
  }

  try {
    const actionsRef = collection(db, "adminActions");
    await addDoc(actionsRef, {
      uid: uid,
      action: action,
      requestedBy: user.uid,
      timestamp: new Date(),
      status: "pending"
    });
    showToast(`✅ ${action} request sent.`);
  } catch (err) {
    console.error(err);
    showToast("❌ Action failed.", true);
  }
}

// Globals
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const rowsPerPage = 10;
const selectedUserIds = new Set();

const tableBody = document.getElementById("userTableBody");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");

function renderTable(users) {
  const start = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = users.slice(start, start + rowsPerPage);
  tableBody.innerHTML = "";

  paginatedUsers.forEach((user) => {
    const isSuspended = user.status === "suspended";
    const isChecked = selectedUserIds.has(user.id);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="checkbox" class="user-checkbox" value="${user.id}" ${isChecked ? "checked" : ""}></td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>
        <span style="color: ${isSuspended ? 'red' : 'green'};">
  ${isSuspended ? "Suspended" : "Active"}
</span>
      </td>
      <td>
        <div class="dropdown">
          <button class="action-btn">Actions ▼</button>
          <div class="dropdown-content">
            <a href="user-profile.html?uid=${user.id}">View Profile</a>
            <a href="#" class="request-delete" data-id="${user.id}">Delete</a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="${isSuspended ? "unsuspend" : "suspend"}">
              ${isSuspended ? "Unsuspend" : "Suspend"}
            </a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="forceSignout">Force Sign Out</a>
          </div>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });

  attachEventListeners();
  updateDeleteSelectedVisibility();
}

function attachEventListeners() {
  // Checkboxes
  document.querySelectorAll(".user-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const uid = checkbox.value;
      if (checkbox.checked) {
        selectedUserIds.add(uid);
      } else {
        selectedUserIds.delete(uid);
      }
      updateDeleteSelectedVisibility();
    });
  });

  // Delete Selected
  deleteSelectedBtn.addEventListener("click", async () => {
    if (!selectedUserIds.size) return;

    const confirm1 = confirm("Are you sure you want to delete selected users?");
    if (!confirm1) return;

    const confirm2 = prompt("Type DELETE to confirm:");
    if (confirm2 !== "DELETE") return showToast("Cancelled.", true);

    for (const uid of selectedUserIds) {
      await deleteDoc(doc(db, "users", uid));
      await requestAdminAction(uid, "delete");
    }

    selectedUserIds.clear();
    showToast("Selected users deleted.");
    loadUsers();
  });

  // Select All
  selectAllCheckbox.addEventListener("change", () => {
    document.querySelectorAll(".user-checkbox").forEach((checkbox) => {
      checkbox.checked = selectAllCheckbox.checked;
      if (selectAllCheckbox.checked) {
        selectedUserIds.add(checkbox.value);
      } else {
        selectedUserIds.delete(checkbox.value);
      }
    });
    updateDeleteSelectedVisibility();
  });

  // Single delete
  document.querySelectorAll(".request-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const confirm1 = confirm("Are you sure you want to delete this user?");
      if (!confirm1) return;
      const confirm2 = prompt("Type DELETE to confirm:");
      if (confirm2 !== "DELETE") return showToast("Cancelled.", true);
      await deleteDoc(doc(db, "users", uid));
      await requestAdminAction(uid, "delete");
      loadUsers();
    });
  });

  // Admin actions
  document.querySelectorAll(".admin-action").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      if (!confirm(`Are you sure you want to ${action} this user?`)) return;
      await requestAdminAction(uid, action);
      loadUsers();
    });
  });
}

function updateDeleteSelectedVisibility() {
  if (deleteSelectedBtn) {
    deleteSelectedBtn.style.display = selectedUserIds.size > 0 ? "inline-block" : "none";
  }
}

function loadUsers() {
  getDocs(collection(db, "users")).then((snapshot) => {
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredUsers = [...allUsers];
    renderTable(filteredUsers);
  });
}

// Auth check
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
