import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase setup
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
const userCount = document.getElementById("userCount");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let allUsers = [];
let currentPage = 1;
const usersPerPage = 20;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    await loadUsers();
  }
});

async function loadUsers() {
  const snapshot = await getDocs(query(collection(db, "users")));
  allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  userCount.textContent = `Total Users: ${allUsers.length}`;
  renderPage(1);
}

function renderPage(page) {
  currentPage = page;
  const start = (page - 1) * usersPerPage;
  const paginatedUsers = allUsers.slice(start, start + usersPerPage);
  userTableBody.innerHTML = "";
  paginatedUsers.forEach(renderUserRow);
  updatePaginationControls();
}

function renderUserRow(user) {
  const row = document.createElement("tr");

  const isSuspended = user.disabled === true;
  const statusLabel = isSuspended
    ? '<span class="badge red">Suspended</span>'
    : '<span class="badge green">Active</span>';

  const dropdown = `
    <select class="actionDropdown" data-uid="${user.id}">
      <option value="">Action</option>
      ${isSuspended
        ? '<option value="unsuspend">Unsuspend</option>'
        : '<option value="suspend">Suspend</option>'}
      <option value="delete">Delete</option>
      <option value="forceSignout">Force Sign Out</option>
    </select>`;

  row.innerHTML = `
    <td><input type="checkbox" class="userCheckbox" data-id="${user.id}"></td>
    <td>${user.firstName || "-"}</td>
    <td>${user.lastName || "-"}</td>
    <td>${user.email || "-"}</td>
    <td>${user.role || "-"}</td>
    <td>${statusLabel}</td>
    <td>${dropdown}</td>
  `;

  userTableBody.appendChild(row);
}

userTableBody.addEventListener("change", async (e) => {
  if (!e.target.classList.contains("actionDropdown")) return;

  const action = e.target.value;
  const uid = e.target.dataset.uid;
  if (!action || !uid) return;

  try {
    await addDoc(collection(db, "adminActions"), { uid, action });
    e.target.value = ""; // Reset dropdown
    await loadUsers();
  } catch (error) {
    console.error("Action failed:", error);
    alert("Action failed.");
  }
});

// Select all toggle
selectAllCheckbox.addEventListener("change", () => {
  const all = document.querySelectorAll(".userCheckbox");
  all.forEach(cb => cb.checked = selectAllCheckbox.checked);
  toggleDeleteButton();
});

userTableBody.addEventListener("change", toggleDeleteButton);

function toggleDeleteButton() {
  const anyChecked = [...document.querySelectorAll(".userCheckbox")].some(cb => cb.checked);
  deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
}

deleteSelectedBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to delete selected users?")) return;
  const selectedIds = [...document.querySelectorAll(".userCheckbox")]
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.id);

  for (const id of selectedIds) {
    await addDoc(collection(db, "adminActions"), { uid: id, action: "delete" });
  }

  alert("Delete actions sent.");
  await loadUsers();
});

function updatePaginationControls() {
  paginationInfo.textContent = `Page ${currentPage}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage * usersPerPage >= allUsers.length;
}

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) renderPage(currentPage - 1);
});

nextBtn.addEventListener("click", () => {
  if (currentPage * usersPerPage < allUsers.length) renderPage(currentPage + 1);
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
