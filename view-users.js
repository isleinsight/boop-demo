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
  updateDoc,
  addDoc // ✅ THIS WAS MISSING
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// FIREBASE CONFIG
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

// UTIL: Admin action Firestore request
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
let currentSort = { column: null, direction: "asc" };

const tableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");

function renderTable(users) {
  const start = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = users.slice(start, start + rowsPerPage);
  tableBody.innerHTML = "";

  paginatedUsers.forEach((user) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td><input type="checkbox" class="rowCheckbox" data-id="${user.id}" /></td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>
        <div class="dropdown">
          <button class="action-btn">Actions ▼</button>
          <div class="dropdown-content">
            <a href="user-profile.html?uid=${user.id}">View Profile</a>
            <a href="#" class="request-delete" data-id="${user.id}">Delete</a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="suspend">Suspend</a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="unsuspend">Unsuspend</a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="forceSignout">Force Sign Out</a>
          </div>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });

  document.getElementById("paginationInfo").textContent = `Page ${currentPage} of ${Math.ceil(users.length / rowsPerPage)}`;
  document.getElementById("prevBtn").disabled = currentPage === 1;
  document.getElementById("nextBtn").disabled = start + rowsPerPage >= users.length;

  // Delete handler (double-confirm)
  document.querySelectorAll(".request-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const confirmStep1 = confirm("Are you sure you want to delete this user?");
      if (!confirmStep1) return;

      const confirmStep2 = prompt("Type DELETE to confirm this permanent action:");
      if (confirmStep2 !== "DELETE") return alert("Cancelled. You must type DELETE exactly.");

      try {
        await deleteDoc(doc(db, "users", uid));
        await requestAdminAction(uid, "delete");
        loadUsers();
      } catch (err) {
        console.error("Error deleting user:", err);
        alert("Something went wrong deleting the user.");
      }
    });
  });

  // Admin actions
  document.querySelectorAll(".admin-action").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      const confirmAction = confirm(`Are you sure you want to ${action} this user?`);
      if (!confirmAction) return;

      try {
        await requestAdminAction(uid, action);
      } catch (err) {
        console.error("Action failed:", err);
        alert("Failed to submit request.");
      }
    });
  });

  document.querySelectorAll(".rowCheckbox").forEach(cb => {
    cb.addEventListener("change", updateDeleteButtonVisibility);
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
    return aVal.localeCompare(bVal) * (currentSort.direction === "asc" ? 1 : -1);
  });
}

function updateDeleteButtonVisibility() {
  const checked = document.querySelectorAll(".rowCheckbox:checked");
  deleteSelectedBtn.style.display = checked.length > 0 ? "inline-block" : "none";
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

selectAllCheckbox.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".rowCheckbox");
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateDeleteButtonVisibility();
});

deleteSelectedBtn.addEventListener("click", async () => {
  const checked = document.querySelectorAll(".rowCheckbox:checked");
  const count = checked.length;
  if (count === 0) return;

  const confirmDelete = confirm(`Are you sure you want to delete ${count} selected user(s)?`);
  if (!confirmDelete) return;

  const typed = prompt(`Type DELETE to confirm deleting ${count} user(s):`);
  if (typed !== "DELETE") return alert("Cancelled.");

  for (let cb of checked) {
    const id = cb.getAttribute("data-id");
    try {
      await deleteDoc(doc(db, "users", id));
      await requestAdminAction(id, "delete");
    } catch (err) {
      console.error("Bulk delete error:", id, err);
    }
  }

  alert(`✅ Deleted ${count} user(s).`);
  loadUsers();
});

function loadUsers() {
  getDocs(collection(db, "users")).then((snapshot) => {
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredUsers = [...allUsers];
    userCount.textContent = `Total Users: ${filteredUsers.length}`;
    renderTable(filteredUsers);
    deleteSelectedBtn.style.display = "none";
    selectAllCheckbox.checked = false;
  }).catch((err) => {
    console.error("Failed to load users:", err);
    alert("Could not load users.");
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

