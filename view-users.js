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
  orderBy,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
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

// DOM Elements
const logoutBtn = document.getElementById("logoutBtn");
const userTableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const searchBtn = document.getElementById("searchBtn");
const searchInput = document.getElementById("searchInput");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let allUsers = [];
let currentPage = 1;
const usersPerPage = 20;

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Fetch users
async function fetchUsers() {
  const q = query(collection(db, "users"), orderBy("firstName"));
  const snapshot = await getDocs(q);
  allUsers = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  renderUsers();
}

// Render users
function renderUsers() {
  userTableBody.innerHTML = "";
  const start = (currentPage - 1) * usersPerPage;
  const end = start + usersPerPage;
  const usersToDisplay = allUsers.slice(start, end);

  usersToDisplay.forEach(user => {
    const row = document.createElement("tr");

    const status = user.disabled ? "Suspended" : "Active";
    const statusColor = user.disabled ? "red" : "green";

    row.innerHTML = `
      <td><input type="checkbox" data-id="${user.id}" class="rowCheckbox" /></td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td><span style="color:${statusColor}; font-weight:bold">${status}</span></td>
      <td>
        <select class="actionDropdown" data-id="${user.id}" data-disabled="${user.disabled}">
          <option value="">Action</option>
          <option value="${user.disabled ? "unsuspend" : "suspend"}">${user.disabled ? "Unsuspend" : "Suspend"}</option>
          <option value="resetPassword">Reset Password</option>
          <option value="forceSignout">Force Sign-Out</option>
          <option value="delete">Delete</option>
        </select>
      </td>
    `;

    userTableBody.appendChild(row);
  });

  userCount.textContent = `Total Users: ${allUsers.length}`;
  paginationInfo.textContent = `Page ${currentPage} of ${Math.ceil(allUsers.length / usersPerPage)}`;
  attachEventListeners();
}

// Attach listeners
function attachEventListeners() {
  document.querySelectorAll(".actionDropdown").forEach(select => {
    select.addEventListener("change", async () => {
      const uid = select.getAttribute("data-id");
      const action = select.value;
      if (!action) return;

      await addDoc(collection(db, "adminActions"), {
        uid,
        action,
        requestedAt: new Date()
      });

      setTimeout(fetchUsers, 1500);
    });
  });

  document.querySelectorAll(".rowCheckbox").forEach(checkbox => {
    checkbox.addEventListener("change", toggleDeleteButton);
  });
}

// Delete Selected
deleteSelectedBtn.addEventListener("click", async () => {
  const selected = document.querySelectorAll(".rowCheckbox:checked");
  if (!selected.length) return;

  for (const box of selected) {
    const uid = box.getAttribute("data-id");
    await addDoc(collection(db, "adminActions"), {
      uid,
      action: "delete",
      requestedAt: new Date()
    });
  }

  setTimeout(fetchUsers, 1500);
});

// Search
searchBtn.addEventListener("click", () => {
  const query = searchInput.value.toLowerCase();
  const filtered = allUsers.filter(user =>
    (user.firstName && user.firstName.toLowerCase().includes(query)) ||
    (user.lastName && user.lastName.toLowerCase().includes(query)) ||
    (user.email && user.email.toLowerCase().includes(query))
  );
  allUsers = filtered;
  currentPage = 1;
  renderUsers();
});

// Select All
selectAllCheckbox.addEventListener("change", () => {
  document.querySelectorAll(".rowCheckbox").forEach(box => {
    box.checked = selectAllCheckbox.checked;
  });
  toggleDeleteButton();
});

function toggleDeleteButton() {
  const anyChecked = document.querySelectorAll(".rowCheckbox:checked").length > 0;
  deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
}

// Pagination
prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderUsers();
  }
});

nextBtn.addEventListener("click", () => {
  if (currentPage < Math.ceil(allUsers.length / usersPerPage)) {
    currentPage++;
    renderUsers();
  }
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    fetchUsers();
  } else {
    window.location.href = "index.html";
  }
});
