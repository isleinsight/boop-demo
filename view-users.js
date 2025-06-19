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
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
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
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM references
const userTableBody = document.getElementById("userTableBody");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const userCount = document.getElementById("userCount");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let allUsers = [];
let filteredUsers = [];
let currentUserEmail = null;
let currentPage = 1;
const usersPerPage = 10;

function createDropdown(user) {
  const select = document.createElement("select");
  select.innerHTML = `
    <option value="action">Action</option>
    <option value="view">View Profile</option>
    ${user.status === "suspended"
      ? '<option value="unsuspend">Unsuspend</option>'
      : '<option value="suspend">Suspend</option>'}
    <option value="signout">Force Sign-out</option>
    <option value="delete">Delete</option>
  `;
  select.addEventListener("change", async () => {
    const action = select.value;
    select.value = "action";
    if (action === "view") {
      window.location.href = `user-profile.html?uid=${user.id}`;
      return;
    }
    if (action === "delete") {
      if (user.email === currentUserEmail) {
        alert("You cannot delete your own account.");
        return;
      }
      const input = prompt("Type DELETE to confirm.");
      if (input !== "DELETE") {
        alert("Canceled.");
        return;
      }
    }
    await performAction(user, action);
  });
  return select;
}

async function performAction(user, action) {
  try {
    await addDoc(collection(db, "adminActions"), {
      uid: user.id,
      action,
      createdAt: new Date()
    });
    if (action === "delete") {
      await deleteDoc(doc(db, "users", user.id));
      allUsers = allUsers.filter(u => u.id !== user.id);
    } else {
      await updateDoc(doc(db, "users", user.id), {
        status: action === "suspend" ? "suspended" : "active"
      });
      const updated = allUsers.find(u => u.id === user.id);
      if (updated) updated.status = action === "suspend" ? "suspended" : "active";
    }
    applyFilters();
  } catch (err) {
    console.error("❌ Action failed:", err);
    alert("Action failed.");
  }
}

function renderTablePage() {
  userTableBody.innerHTML = "";
  const start = (currentPage - 1) * usersPerPage;
  const end = start + usersPerPage;
  const users = filteredUsers.slice(start, end);

  if (users.length === 0) {
    userTableBody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
    return;
  }

  users.forEach(user => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td><input type="checkbox" class="user-checkbox" data-id="${user.id}" data-email="${user.email}" /></td>
      <td>${user.firstName || "-"}</td>
      <td>${user.lastName || "-"}</td>
      <td>${user.email || "-"}</td>
      <td>${user.role || "-"}</td>
      <td>${user.status || "-"}</td>
    `;

    const actionsTd = document.createElement("td");
    actionsTd.appendChild(createDropdown(user));
    row.appendChild(actionsTd);

    userTableBody.appendChild(row);
  });

  document.getElementById("userCount").textContent = `Total Users: ${filteredUsers.length}`;
  paginationInfo.textContent = `Page ${currentPage}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = end >= filteredUsers.length;
}

function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();
  const role = roleFilter.value;
  const status = statusFilter.value;

  filteredUsers = allUsers.filter(user => {
    const matchesSearch =
      user.firstName?.toLowerCase().includes(term) ||
      user.lastName?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term);
    const matchesRole = role === "" || user.role === role;
    const matchesStatus = status === "" || user.status === status;
    return matchesSearch && matchesRole && matchesStatus;
  });

  currentPage = 1;
  renderTablePage();
}

searchBtn?.addEventListener("click", applyFilters);
clearSearchBtn?.addEventListener("click", () => {
  searchInput.value = "";
  roleFilter.value = "";
  statusFilter.value = "";
  applyFilters();
});
roleFilter?.addEventListener("change", applyFilters);
statusFilter?.addEventListener("change", applyFilters);

selectAllCheckbox?.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".user-checkbox");
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateDeleteButton();
});

function updateDeleteButton() {
  const anyChecked = document.querySelectorAll(".user-checkbox:checked").length > 0;
  deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
}

deleteSelectedBtn?.addEventListener("click", async () => {
  const checked = document.querySelectorAll(".user-checkbox:checked");
  const ids = Array.from(checked).map(cb => cb.dataset.id);
  if (ids.includes(currentUserEmail)) {
    alert("You cannot delete your own account.");
    return;
  }
  const input = prompt("Type DELETE to confirm deletion of selected users.");
  if (input !== "DELETE") return;

  for (const id of ids) {
    await deleteDoc(doc(db, "users", id));
    await addDoc(collection(db, "adminActions"), {
      uid: id,
      action: "bulk-delete",
      createdAt: new Date()
    });
  }

  allUsers = allUsers.filter(u => !ids.includes(u.id));
  applyFilters();
});

prevBtn?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTablePage();
  }
});
nextBtn?.addEventListener("click", () => {
  if (currentPage < Math.ceil(filteredUsers.length / usersPerPage)) {
    currentPage++;
    renderTablePage();
  }
});

onAuthStateChanged(auth, async user => {
  if (!user) return window.location.href = "index.html";
  currentUserEmail = user.email;
  const q = query(collection(db, "users"), orderBy("firstName"));
  const snap = await getDocs(q);
  allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  filteredUsers = [...allUsers];
  applyFilters();
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});
