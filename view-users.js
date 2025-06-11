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
  addDoc,
  orderBy,
  startAfter,
  limit,
  getDoc,
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

// Elements
const userTableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const paginationInfo = document.getElementById("paginationInfo");

let allUsers = [];
let currentPage = 1;
let usersPerPage = 20;

function renderUsers() {
  userTableBody.innerHTML = "";
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const pageUsers = allUsers.slice(startIndex, endIndex);

  pageUsers.forEach(user => {
    const row = document.createElement("tr");
    const isSuspended = user.disabled === true;

    row.innerHTML = `
      <td><input type="checkbox" data-uid="${user.uid}" /></td>
      <td>${user.firstName || "-"}</td>
      <td>${user.lastName || "-"}</td>
      <td>${user.email || "-"}</td>
      <td>${user.role || "-"}</td>
      <td>
        ${isSuspended
          ? `<span class="badge suspended">Suspended</span>
             <button class="unsuspendBtn" data-uid="${user.uid}">Unsuspend</button>`
          : `
            <select class="actionDropdown" data-uid="${user.uid}">
              <option value="">Actions</option>
              <option value="delete">Delete</option>
              <option value="suspend">Suspend</option>
              <option value="forceSignout">Force Sign-out</option>
              <option value="resetPassword">Reset Password</option>
            </select>
          `}
      </td>
    `;
    userTableBody.appendChild(row);
  });

  userCount.textContent = `Total Users: ${allUsers.length}`;
  paginationInfo.textContent = `Page ${currentPage}`;
}

async function fetchUsers() {
  const usersSnapshot = await getDocs(collection(db, "users"));
  allUsers = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
  renderUsers();
}

searchBtn.addEventListener("click", () => {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allUsers.filter(user =>
    user.email?.toLowerCase().includes(query) ||
    user.firstName?.toLowerCase().includes(query) ||
    user.lastName?.toLowerCase().includes(query)
  );
  userTableBody.innerHTML = "";
  filtered.forEach(user => {
    const row = document.createElement("tr");
    const isSuspended = user.disabled === true;

    row.innerHTML = `
      <td><input type="checkbox" data-uid="${user.uid}" /></td>
      <td>${user.firstName || "-"}</td>
      <td>${user.lastName || "-"}</td>
      <td>${user.email || "-"}</td>
      <td>${user.role || "-"}</td>
      <td>
        ${isSuspended
          ? `<span class="badge suspended">Suspended</span>
             <button class="unsuspendBtn" data-uid="${user.uid}">Unsuspend</button>`
          : `
            <select class="actionDropdown" data-uid="${user.uid}">
              <option value="">Actions</option>
              <option value="delete">Delete</option>
              <option value="suspend">Suspend</option>
              <option value="forceSignout">Force Sign-out</option>
              <option value="resetPassword">Reset Password</option>
            </select>
          `}
      </td>
    `;
    userTableBody.appendChild(row);
  });
});

document.addEventListener("change", async (e) => {
  if (e.target.classList.contains("actionDropdown")) {
    const action = e.target.value;
    const uid = e.target.getAttribute("data-uid");
    if (!action || !uid) return;

    await addDoc(collection(db, "adminActions"), { uid, action, createdAt: new Date() });
    alert(`${action} action submitted for processing`);
  }
});

document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("unsuspendBtn")) {
    const uid = e.target.getAttribute("data-uid");
    await addDoc(collection(db, "adminActions"), { uid, action: "unsuspend", createdAt: new Date() });
    alert("Unsuspend action submitted for processing");
  }
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderUsers();
  }
});

nextBtn.addEventListener("click", () => {
  if ((currentPage * usersPerPage) < allUsers.length) {
    currentPage++;
    renderUsers();
  }
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    fetchUsers();
  } else {
    window.location.href = "index.html";
  }
});
