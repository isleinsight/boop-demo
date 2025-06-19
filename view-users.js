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
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- Firebase Config ---
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

// --- DOM Elements ---
const userTableBody = document.getElementById("userTableBody");
const logoutBtn = document.getElementById("logoutBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");
const userCount = document.getElementById("userCount");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");

let allUsers = [];
let filteredUsers = [];

function renderUsers(users) {
  userTableBody.innerHTML = "";

  if (users.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7">No users found.</td>`;
    userTableBody.appendChild(row);
    return;
  }

  users.forEach(user => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="checkbox" class="user-checkbox" data-id="${user.id}"></td>
      <td>${user.firstName || "-"}</td>
      <td>${user.lastName || "-"}</td>
      <td>${user.email || "-"}</td>
      <td>${user.role || "-"}</td>
      <td><span class="badge ${user.status === 'suspended' ? 'suspended' : 'active'}">${user.status || "active"}</span></td>
      <td><a href="user-profile.html?uid=${user.id}">View</a></td>
    `;
    userTableBody.appendChild(row);
  });

  userCount.textContent = `Total Users: ${users.length}`;
}

// --- Fetch users from Firestore ---
async function loadUsers() {
  const q = query(collection(db, "users"), orderBy("firstName"));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// --- Apply filters ---
function applyFilters() {
  const search = searchInput.value.toLowerCase();
  const role = roleFilter.value;
  const status = statusFilter.value;

  filteredUsers = allUsers.filter(user => {
    const matchSearch =
      user.firstName?.toLowerCase().includes(search) ||
      user.lastName?.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search);

    const matchRole = !role || user.role === role;
    const matchStatus = !status || user.status === status;

    return matchSearch && matchRole && matchStatus;
  });

  renderUsers(filteredUsers);
}

// --- Auth ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    allUsers = await loadUsers();
    applyFilters();
  }
});

// --- Logout ---
logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

// --- Filters ---
searchBtn?.addEventListener("click", applyFilters);
searchInput?.addEventListener("input", applyFilters);
clearSearchBtn?.addEventListener("click", () => {
  searchInput.value = "";
  roleFilter.value = "";
  statusFilter.value = "";
  applyFilters();
});
roleFilter?.addEventListener("change", applyFilters);
statusFilter?.addEventListener("change", applyFilters);

// --- Delete Selected ---
selectAllCheckbox?.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".user-checkbox");
  checkboxes.forEach(cb => (cb.checked = selectAllCheckbox.checked));
  toggleDeleteBtn();
});

userTableBody?.addEventListener("change", toggleDeleteBtn);

function toggleDeleteBtn() {
  const anyChecked = document.querySelectorAll(".user-checkbox:checked").length > 0;
  deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
}

deleteSelectedBtn?.addEventListener("click", async () => {
  const selected = document.querySelectorAll(".user-checkbox:checked");
  if (!selected.length) return;

  const confirmed = prompt("Type DELETE to confirm");
  if (confirmed !== "DELETE") return;

  for (const cb of selected) {
    const id = cb.dataset.id;
    await deleteDoc(doc(db, "users", id));
  }

  allUsers = allUsers.filter(u => !Array.from(selected).some(cb => cb.dataset.id === u.id));
  applyFilters();
});
