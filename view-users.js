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
  doc,
  query,
  orderBy,
  startAfter,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  addAdminAction
} from "./gov-logic.js"; // Make sure this file includes the addAdminAction function

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
const userCountDisplay = document.getElementById("userCount");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

const USERS_PER_PAGE = 20;
let users = [];
let currentPage = 1;
let filteredUsers = [];

function renderUsers(pageUsers) {
  userTableBody.innerHTML = "";

  pageUsers.forEach(user => {
    const row = document.createElement("tr");

    const isSuspended = user.disabled;

    const actionCell = document.createElement("td");

    if (isSuspended) {
      actionCell.innerHTML = `
        <span class="badge red">Suspended</span>
        <button class="unsuspendBtn" data-uid="${user.uid}" style="margin-left: 6px;">Unsuspend</button>
      `;
    } else {
      actionCell.innerHTML = `
        <select class="actionDropdown" data-uid="${user.uid}">
          <option value="">Action</option>
          <option value="suspend">Suspend</option>
          <option value="delete">Delete</option>
          <option value="resetPassword">Reset Password</option>
          <option value="forceSignout">Force Sign Out</option>
        </select>
      `;
    }

    row.innerHTML = `
      <td><input type="checkbox" class="userCheckbox" data-uid="${user.uid}" /></td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
    `;

    row.appendChild(actionCell);
    userTableBody.appendChild(row);
  });

  document.querySelectorAll(".actionDropdown").forEach(dropdown => {
    dropdown.addEventListener("change", async (e) => {
      const uid = e.target.dataset.uid;
      const action = e.target.value;

      if (action) {
        await addAdminAction(uid, action);
        loadUsers(); // Refresh list to reflect status change
      }
    });
  });

  document.querySelectorAll(".unsuspendBtn").forEach(button => {
    button.addEventListener("click", async (e) => {
      const uid = e.target.dataset.uid;
      await addAdminAction(uid, "unsuspend");
      loadUsers(); // Refresh list
    });
  });
}

function paginate(array, page = 1, perPage = USERS_PER_PAGE) {
  const offset = (page - 1) * perPage;
  return array.slice(offset, offset + perPage);
}

function updatePaginationDisplay() {
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
}

async function loadUsers() {
  const snapshot = await getDocs(query(collection(db, "users"), orderBy("firstName")));
  users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
  filteredUsers = users;
  userCountDisplay.textContent = `Total Users: ${users.length}`;
  currentPage = 1;
  renderUsers(paginate(filteredUsers, currentPage));
  updatePaginationDisplay();
}

searchBtn.addEventListener("click", () => {
  const query = searchInput.value.trim().toLowerCase();
  filteredUsers = users.filter(user =>
    (user.firstName?.toLowerCase().includes(query) || "") ||
    (user.lastName?.toLowerCase().includes(query) || "") ||
    (user.email?.toLowerCase().includes(query) || "")
  );
  currentPage = 1;
  renderUsers(paginate(filteredUsers, currentPage));
  updatePaginationDisplay();
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderUsers(paginate(filteredUsers, currentPage));
    updatePaginationDisplay();
  }
});

nextBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  if (currentPage < totalPages) {
    currentPage++;
    renderUsers(paginate(filteredUsers, currentPage));
    updatePaginationDisplay();
  }
});

selectAllCheckbox.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".userCheckbox");
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  deleteSelectedBtn.style.display = selectAllCheckbox.checked ? "inline-block" : "none";
});

userTableBody.addEventListener("change", () => {
  const checked = document.querySelectorAll(".userCheckbox:checked");
  deleteSelectedBtn.style.display = checked.length > 0 ? "inline-block" : "none";
});

deleteSelectedBtn.addEventListener("click", async () => {
  const confirmed = confirm("Are you sure you want to delete selected users?");
  if (!confirmed) return;

  const selected = document.querySelectorAll(".userCheckbox:checked");
  for (const cb of selected) {
    await addAdminAction(cb.dataset.uid, "delete");
  }
  await loadUsers();
});

onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadUsers();
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});
