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
  query,
  orderBy,
  startAt,
  endAt,
  limit,
  getDoc,
  addDoc,
  setDoc
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

// UI Elements
const userTableBody = document.getElementById("userTableBody");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const userCountDisplay = document.getElementById("userCount");

// Constants
const USERS_PER_PAGE = 20;
let currentPage = 1;
let allUsers = [];

// Load users
async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  displayUsers();
  userCountDisplay.textContent = `Total Users: ${allUsers.length}`;
}

function displayUsers() {
  const startIdx = (currentPage - 1) * USERS_PER_PAGE;
  const paginatedUsers = allUsers.slice(startIdx, startIdx + USERS_PER_PAGE);

  userTableBody.innerHTML = "";

  paginatedUsers.forEach(user => {
    const row = document.createElement("tr");

    const isSuspended = user.suspended === true;
    const badgeOrActions = isSuspended
      ? `<td><span class="badge badge-red">Suspended</span> <button data-id="${user.id}" class="unsuspendBtn">Reinstate</button></td>`
      : `
        <td>
          <select data-id="${user.id}" class="actionSelect">
            <option value="">Select</option>
            <option value="suspend">Suspend</option>
            <option value="delete">Delete</option>
            <option value="resetPassword">Reset Password</option>
            <option value="forceSignout">Force Sign-out</option>
          </select>
        </td>`;

    row.innerHTML = `
      <td><input type="checkbox" class="userCheckbox" data-id="${user.id}"></td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      ${badgeOrActions}
    `;
    userTableBody.appendChild(row);
  });

  paginationInfo.textContent = `Page ${currentPage}`;
  attachEventListeners();
}

function attachEventListeners() {
  document.querySelectorAll(".actionSelect").forEach(select => {
    select.addEventListener("change", async (e) => {
      const action = e.target.value;
      const uid = e.target.getAttribute("data-id");
      if (!action || !uid) return;

      try {
        await addDoc(collection(db, "adminActions"), {
          uid,
          action,
          requestedAt: new Date()
        });
        alert(`${action} action requested for user.`);
        await loadUsers();
      } catch (err) {
        console.error("Action error:", err);
        alert("Action failed.");
      }
    });
  });

  document.querySelectorAll(".unsuspendBtn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const uid = e.target.getAttribute("data-id");
      try {
        await addDoc(collection(db, "adminActions"), {
          uid,
          action: "unsuspend",
          requestedAt: new Date()
        });
        alert(`User reinstatement requested.`);
        await loadUsers();
      } catch (err) {
        console.error("Unsuspend error:", err);
        alert("Failed to reinstate user.");
      }
    });
  });

  document.querySelectorAll(".userCheckbox").forEach(checkbox => {
    checkbox.addEventListener("change", toggleDeleteSelectedBtn);
  });

  selectAllCheckbox.addEventListener("change", () => {
    const isChecked = selectAllCheckbox.checked;
    document.querySelectorAll(".userCheckbox").forEach(cb => cb.checked = isChecked);
    toggleDeleteSelectedBtn();
  });
}

function toggleDeleteSelectedBtn() {
  const anyChecked = [...document.querySelectorAll(".userCheckbox")].some(cb => cb.checked);
  deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
}

deleteSelectedBtn.addEventListener("click", async () => {
  const idsToDelete = [...document.querySelectorAll(".userCheckbox:checked")].map(cb => cb.getAttribute("data-id"));
  if (!confirm(`Delete ${idsToDelete.length} user(s)?`)) return;

  for (const id of idsToDelete) {
    try {
      await addDoc(collection(db, "adminActions"), {
        uid: id,
        action: "delete",
        requestedAt: new Date()
      });
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }
  alert("Delete action(s) requested.");
  await loadUsers();
});

searchBtn.addEventListener("click", () => {
  const searchValue = searchInput.value.toLowerCase();
  const filtered = allUsers.filter(u =>
    (u.firstName && u.firstName.toLowerCase().includes(searchValue)) ||
    (u.lastName && u.lastName.toLowerCase().includes(searchValue)) ||
    (u.email && u.email.toLowerCase().includes(searchValue))
  );
  allUsers = filtered;
  currentPage = 1;
  displayUsers();
});

nextBtn.addEventListener("click", () => {
  if (currentPage * USERS_PER_PAGE < allUsers.length) {
    currentPage++;
    displayUsers();
  }
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    displayUsers();
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) loadUsers();
  else window.location.href = "index.html";
});