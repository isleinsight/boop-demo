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
  query,
  orderBy,
  limit,
  startAfter,
  endBefore,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM elements
const logoutBtn = document.getElementById("logoutBtn");
const tableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

let allUsers = [];
let sortField = "lastName";
let sortAsc = true;

// Auth check
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Fetch users
async function fetchUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderUsers(allUsers);
}
fetchUsers();

// Render user table
function renderUsers(users) {
  const sorted = [...users].sort((a, b) => {
    const fieldA = (a[sortField] || "").toLowerCase();
    const fieldB = (b[sortField] || "").toLowerCase();
    return sortAsc ? fieldA.localeCompare(fieldB) : fieldB.localeCompare(fieldA);
  });

  tableBody.innerHTML = "";
  sorted.forEach(user => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>
        <div class="dropdown">
          <button class="action-btn">Actions <span>▾</span></button>
          <div class="dropdown-content">
            <a href="user-profile.html?uid=${user.id}">View Profile</a>
            <a href="#" data-id="${user.id}" class="delete-link">Delete</a>
          </div>
        </div>
      </td>
    `;

    tableBody.appendChild(tr);
  });

  userCount.textContent = `Total Users: ${users.length}`;

  // Add delete event listeners
  document.querySelectorAll(".delete-link").forEach(link => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const uid = e.target.getAttribute("data-id");

      const confirmText = prompt("⚠️ Type 'delete' to confirm deletion of this user:");
      if (confirmText && confirmText.toLowerCase() === "delete") {
        try {
          await deleteDoc(doc(db, "users", uid));
          alert("User deleted.");
          fetchUsers();
        } catch (error) {
          console.error("Error deleting user:", error);
          alert("Failed to delete user.");
        }
      } else {
        alert("User not deleted.");
      }
    });
  });
}

// Search
searchBtn.addEventListener("click", () => {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allUsers.filter(user =>
    (user.firstName || "").toLowerCase().includes(query) ||
    (user.lastName || "").toLowerCase().includes(query) ||
    (user.email || "").toLowerCase().includes(query)
  );
  renderUsers(filtered);
});

// Sort handlers
document.querySelectorAll("th[data-sort]").forEach(header => {
  header.addEventListener("click", () => {
    const field = header.getAttribute("data-sort");
    if (sortField === field) {
      sortAsc = !sortAsc;
    } else {
      sortField = field;
      sortAsc = true;
    }
    renderUsers(allUsers);
  });
});
