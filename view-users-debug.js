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

const userTableBody = document.getElementById("userTableBody");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const userCount = document.getElementById("userCount");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let currentUserEmail = null;
let currentPage = 1;
const usersPerPage = 20;
let allUsers = [];
let filteredUsers = [];

function createActionDropdown(user) {
  const select = document.createElement("select");
  select.innerHTML = \`
    <option value="action">Action</option>
    <option value="view">View Profile</option>
    \${user.status === "suspended" ? '<option value="unsuspend">Unsuspend</option>' : '<option value="suspend">Suspend</option>'}
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

    if (["suspend", "unsuspend", "signout"].includes(action)) {
      if (!confirm(\`Are you sure you want to \${action} this user?\`)) return;
    }

    if (action === "delete") {
      if (user.email === currentUserEmail) {
        alert("You cannot delete your own admin account.");
        return;
      }
      const input = prompt("Type DELETE to confirm.");
      if (input !== "DELETE") return;
    }

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
      const u = allUsers.find(u => u.id === user.id);
      if (u) u.status = action === "suspend" ? "suspended" : "active";
    }

    applyFilters();
  });
  return select;
}

async function loadUsers() {
  const snapshot = await getDocs(query(collection(db, "users")));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

function renderTable(users) {
  userTableBody.innerHTML = "";
  const start = (currentPage - 1) * usersPerPage;
  const end = start + usersPerPage;
  const pageUsers = users.slice(start, end);

  if (users.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7">No users found.</td>';
    userTableBody.appendChild(row);
    return;
  }

  pageUsers.forEach(user => {
    const row = document.createElement("tr");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("user-checkbox");
    checkbox.dataset.userId = user.id;
    checkbox.dataset.userEmail = user.email;
    checkbox.addEventListener("change", toggleDeleteButton);

    row.appendChild(Object.assign(document.createElement("td"), { appendChild: checkbox }));
    row.innerHTML += \`
      <td>\${user.firstName || ""}</td>
      <td>\${user.lastName || ""}</td>
      <td>\${user.email || ""}</td>
      <td>\${user.role || ""}</td>
      <td>\${user.status || ""}</td>
    \`;

    const actionTd = document.createElement("td");
    actionTd.appendChild(createActionDropdown(user));
    row.appendChild(actionTd);

    userTableBody.appendChild(row);
  });

  userCount.textContent = \`Total Users: \${users.length}\`;
  paginationInfo.textContent = \`Page \${currentPage} of \${Math.ceil(users.length / usersPerPage)}\`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = end >= users.length;
}

function applyFilters() {
  const searchTerm = searchInput.value.toLowerCase();
  const role = roleFilter.value;
  const status = statusFilter.value;

  filteredUsers = allUsers.filter(u => {
    const matchesSearch = u.firstName?.toLowerCase().includes(searchTerm)
      || u.lastName?.toLowerCase().includes(searchTerm)
      || u.email?.toLowerCase().includes(searchTerm);
    const matchesRole = role === "" || u.role === role;
    const matchesStatus = status === "" || u.status === status;
    return matchesSearch && matchesRole && matchesStatus;
  });

  currentPage = 1;
  renderTable(filteredUsers);
}

function toggleDeleteButton() {
  const anyChecked = document.querySelectorAll(".user-checkbox:checked").length > 0;
  deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
}

searchBtn.addEventListener("click", applyFilters);
searchInput.addEventListener("input", applyFilters);
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
  toggleDeleteButton();
});

deleteSelectedBtn.addEventListener("click", async () => {
  const checkboxes = document.querySelectorAll(".user-checkbox:checked");
  if (checkboxes.length === 0) return;

  const emails = Array.from(checkboxes).map(cb => cb.dataset.userEmail);
  if (emails.includes(currentUserEmail)) {
    alert("You cannot delete your own admin account.");
    return;
  }

  const confirmText = prompt(\`Type DELETE to confirm deleting \${checkboxes.length} users\`);
  if (confirmText !== "DELETE") return;

  for (const cb of checkboxes) {
    const id = cb.dataset.userId;
    await deleteDoc(doc(db, "users", id));
    await addDoc(collection(db, "adminActions"), {
      uid: id,
      action: "delete",
      createdAt: new Date()
    });
  }

  allUsers = allUsers.filter(u => !checkboxes.some(cb => cb.dataset.userId === u.id));
  applyFilters();
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable(filteredUsers);
  }
});

nextBtn.addEventListener("click", () => {
  if ((currentPage * usersPerPage) < filteredUsers.length) {
    currentPage++;
    renderTable(filteredUsers);
  }
});

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = "index.html";
  currentUserEmail = user.email;
  allUsers = await loadUsers();
  filteredUsers = [...allUsers];
  applyFilters();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => location.href = "index.html");
});
