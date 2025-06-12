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

const userTableBody = document.getElementById("userTableBody");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const userCount = document.getElementById("userCount");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const paginationInfo = document.getElementById("paginationInfo");

// Pagination settings
let currentPage = 1;
const usersPerPage = 20;
let filteredUsers = [];

function createBadge(status) {
  const span = document.createElement("span");
  span.className = "badge";
  span.textContent = status === "suspended" ? "Suspended" : "Active";
  span.style.backgroundColor = status === "suspended" ? "#e74c3c" : "#27ae60";
  return span;
}

function createDropdown(user) {
  const select = document.createElement("select");
  select.innerHTML = `
    <option value="action">Action</option>
    ${user.status === "suspended"
      ? '<option value="unsuspend">Unsuspend</option>'
      : '<option value="suspend">Suspend</option>'
    }
    <option value="signout">Force Sign-out</option>
    <option value="delete">Delete</option>
  `;
  select.addEventListener("change", async () => {
    const action = select.value;
    select.value = "action"; // Reset dropdown

    if (action === "suspend" || action === "unsuspend" || action === "signout") {
      const confirmed = await showModalConfirm(`Are you sure you want to ${action} this user?`);
      if (!confirmed) return;
    }

    if (action === "delete") {
      const input = prompt("Type DELETE to confirm.");
      if (input !== "DELETE") {
        alert("Delete canceled.");
        return;
      }
    }

    handleAction(user, action);
  });

  return select;
}

function showModalConfirm(message) {
  return new Promise((resolve) => {
    const confirmed = window.confirm(message);
    resolve(confirmed);
  });
}

async function handleAction(user, action) {
  try {
    await addDoc(collection(db, "adminActions"), {
      uid: user.id,
      action,
      createdAt: new Date()
    });

    if (action === "delete") {
      await deleteDoc(doc(db, "users", user.id));
      filteredUsers = filteredUsers.filter(u => u.id !== user.id);
    } else {
      const ref = doc(db, "users", user.id);
      await ref.update({ status: action === "suspend" ? "suspended" : "active" });
    }

    loadTable();
  } catch (err) {
    console.error("Action failed:", err);
    alert("Failed to perform action.");
  }
}


async function loadUsers() {
  const q = query(collection(db, "users"), orderBy("firstName"));
  const snapshot = await getDocs(q);
  const users = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  return users;
}

function renderTablePage() {
  userTableBody.innerHTML = "";
  const start = (currentPage - 1) * usersPerPage;
  const end = start + usersPerPage;
  const pageUsers = filteredUsers.slice(start, end);

  pageUsers.forEach(user => {
    const row = document.createElement("tr");

    // Checkbox
    const checkboxTd = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("user-checkbox");
    checkbox.dataset.userId = user.id;
    checkboxTd.appendChild(checkbox);

    // First name, last name, email, role
    const firstNameTd = document.createElement("td");
    firstNameTd.textContent = user.firstName || "";

    const lastNameTd = document.createElement("td");
    lastNameTd.textContent = user.lastName || "";

    const emailTd = document.createElement("td");
    emailTd.textContent = user.email || "";

    const roleTd = document.createElement("td");
    roleTd.textContent = user.role || "";

    // Status
    const statusTd = document.createElement("td");
    statusTd.appendChild(createBadge(user.status || "active"));

    // Actions
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

  paginationInfo.textContent = `Page ${currentPage}`;
  userCount.textContent = `Total Users: ${filteredUsers.length}`;
  deleteSelectedBtn.style.display = document.querySelectorAll(".user-checkbox:checked").length > 0 ? "inline-block" : "none";
}

function loadTable() {
  renderTablePage();
}

searchBtn.addEventListener("click", () => {
  const term = searchInput.value.trim().toLowerCase();
  filteredUsers = filteredUsers.filter(user =>
    user.firstName?.toLowerCase().includes(term) ||
    user.lastName?.toLowerCase().includes(term) ||
    user.email?.toLowerCase().includes(term)
  );
  currentPage = 1;
  loadTable();
});

selectAllCheckbox.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".user-checkbox");
  checkboxes.forEach(cb => (cb.checked = selectAllCheckbox.checked));
  deleteSelectedBtn.style.display = checkboxes.length > 0 && selectAllCheckbox.checked ? "inline-block" : "none";
});

deleteSelectedBtn.addEventListener("click", async () => {
  const checked = document.querySelectorAll(".user-checkbox:checked");
  if (checked.length === 0) return;

  const input = prompt(`Type DELETE to confirm deletion of ${checked.length} users.`);
  if (input !== "DELETE") {
    alert("Bulk delete canceled.");
    return;
  }

  for (const cb of checked) {
    const userId = cb.dataset.userId;
    await addDoc(collection(db, "adminActions"), {
      uid: userId,
      action: "delete",
      createdAt: new Date()
    });
    await deleteDoc(doc(db, "users", userId));
  }

  filteredUsers = filteredUsers.filter(u => ![...checked].map(cb => cb.dataset.userId).includes(u.id));
  loadTable();
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTablePage();
  }
});

nextBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTablePage();
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const allUsers = await loadUsers();
    filteredUsers = allUsers;
    renderTablePage();
  } else {
    window.location.href = "index.html";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
