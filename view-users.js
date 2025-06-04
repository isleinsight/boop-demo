import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  getUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  limit,
  orderBy,
  startAfter
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

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const tableBody = document.getElementById("userTableBody");
const logoutBtn = document.getElementById("logoutBtn");
const userCountSpan = document.getElementById("userCount");
const paginationInfo = document.getElementById("paginationInfo");

let lastVisible = null;
let currentPage = 1;
const USERS_PER_PAGE = 20;
let allUsers = [];

function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate();
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Authentication check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  console.log("Authenticated as:", user.email);
  await loadUsers();
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  }).catch((error) => {
    console.error("Logout failed:", error);
  });
});

async function loadUsers() {
  try {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    allUsers = [];
    querySnapshot.forEach((doc) => {
      allUsers.push({ id: doc.id, ...doc.data() });
    });

    renderPage(1);
  } catch (error) {
    console.error("Error loading users:", error);
    tableBody.innerHTML = `<tr><td colspan="6">❌ Failed to load users.</td></tr>`;
  }
}

function renderPage(pageNumber) {
  currentPage = pageNumber;
  tableBody.innerHTML = "";

  const start = (pageNumber - 1) * USERS_PER_PAGE;
  const end = start + USERS_PER_PAGE;
  const pageUsers = allUsers.slice(start, end);

  pageUsers.forEach((user) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${user.firstName || "—"}</td>
      <td>${user.lastName || "—"}</td>
      <td>${user.email || "—"}</td>
      <td>${user.role || "—"}</td>
      <td>${user.addedBy || "—"}</td>
      <td>${formatDate(user.createdAt)}</td>
    `;

    tableBody.appendChild(row);
  });

  // Update page info
  const totalPages = Math.ceil(allUsers.length / USERS_PER_PAGE);
  paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  userCountSpan.textContent = allUsers.length;

  // Show/hide pagination buttons
  document.getElementById("prevBtn").disabled = currentPage === 1;
  document.getElementById("nextBtn").disabled = currentPage === totalPages;
}

// Pagination controls
document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentPage > 1) {
    renderPage(currentPage - 1);
  }
});

document.getElementById("nextBtn").addEventListener("click", () => {
  const totalPages = Math.ceil(allUsers.length / USERS_PER_PAGE);
  if (currentPage < totalPages) {
    renderPage(currentPage + 1);
  }
});
