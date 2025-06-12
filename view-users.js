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
  query,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  where
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

// Elements
const logoutBtn = document.getElementById("logoutBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const userTableBody = document.getElementById("userTableBody");
const userCountSpan = document.getElementById("userCount");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");

let users = [];
let currentPage = 1;
const itemsPerPage = 20;

// Load users
async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  displayUsers();
}

// Display users
function displayUsers(filteredUsers = users) {
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const currentUsers = filteredUsers.slice(start, end);

  userTableBody.innerHTML = "";

  currentUsers.forEach(user => {
    const row = document.createElement("tr");

    const statusColor = user.disabled ? "red" : "green";
    const statusLabel = user.disabled ? "Suspended" : "Active";

    row.innerHTML = `
      <td><input type="checkbox" class="userCheckbox" data-id="${user.id}"></td>
      <td>${user.firstName}</td>
      <td>${user.lastName}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td><span class="status-badge" style="color: ${statusColor}; font-weight: bold;">${statusLabel}</span></td>
      <td>
        <select class="actionDropdown" data-id="${user.id}">
          <option value="none">Action</option>
          <option value="suspend">Suspend</option>
          <option value="unsuspend">Unsuspend</option>
          <option value="resetPassword">Reset Password</option>
          <option value="delete">Delete</option>
        </select>
      </td>
    `;
    userTableBody.appendChild(row);
  });

  userCountSpan.textContent = `Total Users: ${filteredUsers.length}`;
  setupDropdownListeners();
}

// Setup action dropdowns
function setupDropdownListeners() {
  document.querySelectorAll(".actionDropdown").forEach(dropdown => {
    dropdown.addEventListener("change", async (e) => {
      const userId = dropdown.dataset.id;
      const action = dropdown.value;

      if (action === "none") return;

      if (action === "delete") {
        const confirmText = prompt("Type DELETE to confirm deleting this user:");
        if (confirmText !== "DELETE") {
          alert("Cancelled. User not deleted.");
          dropdown.value = "none";
          return;
        }
      }

      await addDoc(collection(db, "adminActions"), {
        uid: userId,
        action: action,
        requestedAt: new Date()
      });

      alert(`✅ ${action.charAt(0).toUpperCase() + action.slice(1)} issued.`);
      dropdown.value = "none";
      await loadUsers();
    });
  });
}

// Bulk delete
deleteSelectedBtn.addEventListener("click", async () => {
  const selectedCheckboxes = document.querySelectorAll(".userCheckbox:checked");
  if (selectedCheckboxes.length === 0) {
    alert("Please select users to delete.");
    return;
  }

  const confirmText = prompt(`Type DELETE to confirm deleting ${selectedCheckboxes.length} user(s):`);
  if (confirmText !== "DELETE") {
    alert("Cancelled. No users were deleted.");
    return;
  }

  for (let checkbox of selectedCheckboxes) {
    const uid = checkbox.dataset.id;
    await addDoc(collection(db, "adminActions"), {
      uid,
      action: "delete",
      requestedAt: new Date()
    });
  }

  alert(`✅ Bulk delete issued for ${selectedCheckboxes.length} user(s).`);
  await loadUsers();
});

// Select All checkbox
selectAllCheckbox.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".userCheckbox");
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  toggleDeleteButton();
});

// Toggle delete button visibility
function toggleDeleteButton() {
  const anyChecked = document.querySelectorAll(".userCheckbox:checked").length > 0;
  deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
}

document.addEventListener("change", toggleDeleteButton);

// Search
searchBtn.addEventListener("click", () => {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const filtered = users.filter(user =>
    user.firstName?.toLowerCase().includes(searchTerm) ||
    user.lastName?.toLowerCase().includes(searchTerm) ||
    user.email?.toLowerCase().includes(searchTerm)
  );
  currentPage = 1;
  displayUsers(filtered);
});

// Pagination
document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    displayUsers();
  }
});
document.getElementById("nextBtn").addEventListener("click", () => {
  const maxPage = Math.ceil(users.length / itemsPerPage);
  if (currentPage < maxPage) {
    currentPage++;
    displayUsers();
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUsers();
  } else {
    window.location.href = "index.html";
  }
});
