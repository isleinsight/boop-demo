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
  orderBy
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

let allUsers = [];
let currentPage = 1;
const usersPerPage = 20;

const tableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const paginationInfo = document.getElementById("paginationInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

function renderTable() {
  tableBody.innerHTML = "";

  const start = (currentPage - 1) * usersPerPage;
  const end = start + usersPerPage;
  const usersToShow = allUsers.slice(start, end);

  usersToShow.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>${user.addedBy || ""}</td>
      <td>${user.createdAt || ""}</td>
    `;
    tableBody.appendChild(row);
  });

  userCount.textContent = `Total Users: ${allUsers.length}`;
  paginationInfo.textContent = `Page ${currentPage} of ${Math.ceil(allUsers.length / usersPerPage)}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = end >= allUsers.length;
}

function formatTimestamp(timestamp) {
  if (!timestamp || !timestamp.toDate) return "";
  return timestamp.toDate().toLocaleString();
}

async function loadUsers() {
  try {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    allUsers = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        email: data.email || "", // Some users may not have this, fallback
        createdAt: formatTimestamp(data.createdAt)
      };
    });

    renderTable();
  } catch (error) {
    console.error("Error loading users:", error);
    tableBody.innerHTML = `<tr><td colspan="6">❌ Error loading users: ${error.message}</td></tr>`;
  }
}

// Navigation
prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});

nextBtn.addEventListener("click", () => {
  if ((currentPage * usersPerPage) < allUsers.length) {
    currentPage++;
    renderTable();
  }
});

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "index.html";
    }).catch((error) => {
      alert("Logout failed: " + error.message);
    });
  });
}

// Auth check and load
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    console.log("Logged in as:", user.email);
    loadUsers();
  }
});
