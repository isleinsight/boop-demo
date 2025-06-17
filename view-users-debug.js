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
  doc,
  deleteDoc,
  updateDoc,
  query
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

// Elements
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

let currentUserEmail = null;
let currentPage = 1;
const usersPerPage = 20;
let allUsers = [];
let filteredUsers = [];

function createBadge(status) {
  const span = document.createElement("span");
  span.textContent = status;
  span.classList.add("badge", status === "suspended" ? "suspended" : "active");
  return span;
}

function createDropdown(user) {
  const select = document.createElement("select");
  select.innerHTML = \`
    <option value="action">Action</option>
    <option value="view">View Profile</option>
    <option value="suspend">Suspend</option>
    <option value="unsuspend">Unsuspend</option>
    <option value="signout">Force Sign-out</option>
    <option value="delete">Delete</option>
  \`;
  select.addEventListener("change", async () => {
    const action = select.value;
    select.value = "action";

    if (action === "view") {
      window.location.href = \`user-profile.html?uid=\${user.id}\`;
      return;
    }

    const confirmed =
      action === "delete"
        ? prompt("Type DELETE to confirm.") === "DELETE"
        : confirm(\`Are you sure you want to \${action} this user?\`);

    if (!confirmed) return;

    if (action === "delete") {
      await deleteDoc(doc(db, "users", user.id));
    } else {
      await updateDoc(doc(db, "users", user.id), {
        status: action === "suspend" ? "suspended" : "active"
      });
    }

    allUsers = await loadUsers();
    applyFilters();
  });
  return select;
}

function renderTablePage() {
  userTableBody.innerHTML = "";
  const start = (currentPage - 1) * usersPerPage;
  const pageUsers = filteredUsers.slice(start, start + usersPerPage);

  if (filteredUsers.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No users found.";
    row.appendChild(cell);
    userTableBody.appendChild(row);
    return;
  }

  pageUsers.forEach(user => {
    const row = document.createElement("tr");

    const checkboxTd = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("user-checkbox");
    checkbox.dataset.userId = user.id;
    checkbox.dataset.userEmail = user.email;
    checkbox.addEventListener("change", updateDeleteButtonVisibility);
    checkboxTd.appendChild(checkbox);

    const firstNameTd = document.createElement("td");
    firstNameTd.textContent = user.firstName || "";

    const lastNameTd = document.createElement("td");
    lastNameTd.textContent = user.lastName || "";

    const emailTd = document.createElement("td");
    emailTd.textContent = user.email || "";

    const roleTd = document.createElement("td");
    roleTd.textContent = user.role || "";

    const statusTd = document.createElement("td");
    statusTd.appendChild(createBadge(user.status || "active"));

    const actionsTd = document.createElement("td");
    actionsTd.appendChild(createDropdown(user));

    row.appendChild(checkboxTd);
    row.appendChild(firstNameTd);
    row.appendChild(lastNameTd);
    row.appendChild(emailTd);
    row.appendChild(roleTd);
    row.appendChild(statusTd);
    row.appendChild(actionsTd);

    userTableBody.appendChild(row);
  });

  paginationInfo.textContent = \`Page \${currentPage} of \${Math.max(1, Math.ceil(filteredUsers.length / usersPerPage))}\`;
  userCount.textContent = \`Total Users: \${filteredUsers.length}\`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = (currentPage * usersPerPage) >= filteredUsers.length;
}

function updateDeleteButtonVisibility() {
  const checked = document.querySelectorAll(".user-checkbox:checked");
  deleteSelectedBtn.style.display = checked.length > 0 ? "inline-block" : "none";
}

function applyFilters() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedRole = roleFilter.value;
  const selectedStatus = statusFilter.value;

  filteredUsers = allUsers.filter(user => {
    const matchesSearch = [user.firstName, user.lastName, user.email].some(field =>
      field?.toLowerCase().includes(searchTerm)
    );
    const matchesRole = !selectedRole || user.role === selectedRole;
    const matchesStatus = !selectedStatus || user.status === selectedStatus;
    return matchesSearch && matchesRole && matchesStatus;
  });

  currentPage = 1;
  renderTablePage();
}

async function loadUsers() {
  const snapshot = await getDocs(query(collection(db, "users")));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

searchBtn.addEventListener("click", applyFilters);
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  roleFilter.value = "";
  statusFilter.value = "";
  applyFilters();
});
roleFilter.addEventListener("change", applyFilters);
statusFilter.addEventListener("change", applyFilters);

selectAllCheckbox.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".user-checkbox");
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateDeleteButtonVisibility();
});

deleteSelectedBtn.addEventListener("click", async () => {
  const selected = document.querySelectorAll(".user-checkbox:checked");
  if (selected.length === 0) return;

  const confirmDelete = prompt("Type DELETE to confirm.");
  if (confirmDelete !== "DELETE") return;

  for (const cb of selected) {
    await deleteDoc(doc(db, "users", cb.dataset.userId));
  }

  allUsers = await loadUsers();
  applyFilters();
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTablePage();
  }
});
nextBtn.addEventListener("click", () => {
  if ((currentPage * usersPerPage) < filteredUsers.length) {
    currentPage++;
    renderTablePage();
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUserEmail = user.email;
  allUsers = await loadUsers();
  applyFilters();
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});
