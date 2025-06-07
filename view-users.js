// Firebase v10 imports
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
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const rowsPerPage = 10;
let currentSort = { column: null, direction: "asc" };

const tableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");

function renderTable(users) {
  const start = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = users.slice(start, start + rowsPerPage);
  tableBody.innerHTML = "";

  paginatedUsers.forEach((user) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td><input type="checkbox" class="userCheckbox" data-id="${user.id}" /></td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>
        <div class="dropdown">
          <button class="action-btn">Actions ▼</button>
          <div class="dropdown-content">
            <a href="user-profile.html?uid=${user.id}">View Profile</a>
            <a href="#" class="delete-user" data-id="${user.id}">Delete</a>
          </div>
        </div>
      </td>
    `;

    tableBody.appendChild(row);
  });

  document.getElementById("paginationInfo").textContent = `Page ${currentPage} of ${Math.ceil(users.length / rowsPerPage)}`;
  document.getElementById("prevBtn").disabled = currentPage === 1;
  document.getElementById("nextBtn").disabled = start + rowsPerPage >= users.length;

  document.querySelectorAll(".delete-user").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-id");
      const confirmDelete = confirm("Are you sure you want to delete this user?");
      if (!confirmDelete) return;

      const typed = prompt("Type DELETE to confirm:");
      if (typed !== "DELETE") {
        alert("User not deleted. You must type DELETE exactly.");
        return;
      }

      try {
        await deleteDoc(doc(db, "users", id));
        alert("User deleted.");
        loadUsers();
      } catch (err) {
        console.error("Error deleting:", err);
        alert("Error deleting user.");
      }
    });
  });
}

function sortUsers(users, column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    currentSort.column = column;
    currentSort.direction = "asc";
  }

  document.querySelectorAll("th.sortable").forEach(th => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.column === column) {
      th.classList.add(currentSort.direction === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });

  return users.sort((a, b) => {
    const aVal = (a[column] || "").toLowerCase();
    const bVal = (b[column] || "").toLowerCase();
    if (aVal < bVal) return currentSort.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return currentSort.direction === "asc" ? 1 : -1;
    return 0;
  });
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

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    filteredUsers = sortUsers(filteredUsers, th.dataset.column);
    renderTable(filteredUsers);
  });
});

async function loadUsers() {
  try {
    const snapshot = await getDocs(collection(db, "users"));
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredUsers = [...allUsers];
    userCount.textContent = `Total Users: ${filteredUsers.length}`;
    renderTable(filteredUsers);
  } catch (err) {
    console.error("Failed to load users:", err);
    alert("Could not load users.");
  }
}

// Bulk delete
deleteSelectedBtn.addEventListener("click", async () => {
  const checkedBoxes = document.querySelectorAll(".userCheckbox:checked");
  if (checkedBoxes.length === 0) {
    alert("Please select at least one user to delete.");
    return;
  }

  const confirmDelete = confirm(`Are you sure you want to delete ${checkedBoxes.length} user(s)?`);
  if (!confirmDelete) return;

  const typed = prompt("Type DELETE to confirm:");
  if (typed !== "DELETE") {
    alert("You must type DELETE exactly to proceed.");
    return;
  }

  for (const box of checkedBoxes) {
    const id = box.getAttribute("data-id");
    try {
      await deleteDoc(doc(db, "users", id));
    } catch (err) {
      console.error("Error deleting user:", err);
    }
  }

  alert("Selected users deleted.");
  loadUsers();
});

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
