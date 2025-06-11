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

const userTableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const instructions = document.getElementById("instructions");

let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const rowsPerPage = 20;
let currentSort = { column: null, direction: "asc" };

instructions.textContent = "✔ Suspended users show a badge and a Reinstate button instead of the usual actions.";

function renderTable(users) {
  const start = (currentPage - 1) * rowsPerPage;
  const paginatedUsers = users.slice(start, start + rowsPerPage);
  userTableBody.innerHTML = "";

  paginatedUsers.forEach((user) => {
    const row = document.createElement("tr");
    const isSuspended = user.disabled === true;

    row.innerHTML = `
      <td><input type="checkbox" class="rowCheckbox" data-id="${user.id}" /></td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>
        ${isSuspended
          ? `<span class="badge suspended">Suspended</span>
             <button class="reinstateBtn" data-id="${user.id}">Reinstate</button>`
          : `
        <div class="dropdown">
          <button class="action-btn">Actions ▼</button>
          <div class="dropdown-content">
            <a href="user-profile.html?uid=${user.id}">View Profile</a>
            <a href="#" class="request-delete" data-id="${user.id}">Delete</a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="suspend">Suspend</a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="forceSignout">Force Sign-out</a>
            <a href="#" class="admin-action" data-id="${user.id}" data-action="resetPassword">Reset Password</a>
          </div>
        </div>`}
      </td>
    `;

    userTableBody.appendChild(row);
  });

  document.getElementById("paginationInfo").textContent = `Page ${currentPage} of ${Math.ceil(users.length / rowsPerPage)}`;
  document.getElementById("prevBtn").disabled = currentPage === 1;
  document.getElementById("nextBtn").disabled = start + rowsPerPage >= users.length;

  // Actions
  document.querySelectorAll(".admin-action").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      const confirmAction = confirm(`Are you sure you want to ${action} this user?`);
      if (!confirmAction) return;
      await addDoc(collection(db, "adminActions"), {
        uid,
        action,
        timestamp: new Date(),
        status: "pending"
      });
      alert(`${action} requested.`);
      loadUsers();
    });
  });

  document.querySelectorAll(".request-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = btn.getAttribute("data-id");
      const confirm1 = confirm("Are you sure you want to delete this user?");
      if (!confirm1) return;
      const confirm2 = prompt("Type DELETE to confirm.");
      if (confirm2 !== "DELETE") return alert("Cancelled.");

      await deleteDoc(doc(db, "users", uid));
      await addDoc(collection(db, "adminActions"), {
        uid,
        action: "delete",
        timestamp: new Date(),
        status: "pending"
      });
      alert("Deleted.");
      loadUsers();
    });
  });

  document.querySelectorAll(".reinstateBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.getAttribute("data-id");
      const confirmReinstate = confirm("Reinstate this suspended user?");
      if (!confirmReinstate) return;
      await addDoc(collection(db, "adminActions"), {
        uid,
        action: "unsuspend",
        timestamp: new Date(),
        status: "pending"
      });
      alert("User reinstated.");
      loadUsers();
    });
  });

  document.querySelectorAll(".rowCheckbox").forEach(cb => {
    cb.addEventListener("change", updateDeleteButtonVisibility);
  });
}

function updateDeleteButtonVisibility() {
  const checked = document.querySelectorAll(".rowCheckbox:checked");
  deleteSelectedBtn.style.display = checked.length > 0 ? "inline-block" : "none";
}

selectAllCheckbox.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".rowCheckbox");
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateDeleteButtonVisibility();
});

deleteSelectedBtn.addEventListener("click", async () => {
  const checked = document.querySelectorAll(".rowCheckbox:checked");
  if (checked.length === 0) return;
  const confirmDelete = confirm(`Delete ${checked.length} user(s)?`);
  if (!confirmDelete) return;
  const typed = prompt("Type DELETE to confirm:");
  if (typed !== "DELETE") return alert("Cancelled.");

  for (const cb of checked) {
    const uid = cb.getAttribute("data-id");
    await deleteDoc(doc(db, "users", uid));
    await addDoc(collection(db, "adminActions"), {
      uid,
      action: "delete",
      timestamp: new Date(),
      status: "pending"
    });
  }

  alert("Selected users deleted.");
  loadUsers();
});

function handleSearch() {
  const value = searchInput.value.toLowerCase();
  filteredUsers = allUsers.filter(u =>
    (`${u.firstName} ${u.lastName} ${u.email} ${u.role}`).toLowerCase().includes(value)
  );
  currentPage = 1;
  renderTable(filteredUsers);
  userCount.textContent = `Total Users: ${filteredUsers.length}`;
}

searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("input", handleSearch);

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

function loadUsers() {
  getDocs(collection(db, "users")).then(snapshot => {
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    filteredUsers = [...allUsers];
    currentPage = 1;
    renderTable(filteredUsers);
    deleteSelectedBtn.style.display = "none";
    selectAllCheckbox.checked = false;
    userCount.textContent = `Total Users: ${filteredUsers.length}`;
  }).catch(err => {
    console.error("Failed to load users:", err);
    alert("Failed to load users.");
  });
}

onAuthStateChanged(auth, user => {
  if (user) loadUsers();
  else window.location.href = "index.html";
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
