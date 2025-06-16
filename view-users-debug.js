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
  addDoc,
  updateDoc,
  query
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

console.log("📦 Initializing Firebase app...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Refs
const userTableBody = document.getElementById("userTableBody");
if (!userTableBody) console.error("❌ Missing #userTableBody in HTML");

let currentUserEmail = null;
let allUsers = [];

async function loadUsers() {
  try {
    console.log("📥 Fetching users from Firestore...");
    const q = query(collection(db, "users")); // No orderBy to avoid index requirement
    const snapshot = await getDocs(q);
    console.log("✅ Retrieved", snapshot.size, "users");
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("❌ Error loading users:", error);
    return [];
  }
}

function renderTable(users) {
  if (!userTableBody) {
    console.error("❌ userTableBody missing in DOM");
    return;
  }

  userTableBody.innerHTML = "";

  if (users.length === 0) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No users found.";
    row.appendChild(td);
    userTableBody.appendChild(row);
    console.warn("⚠️ No users to display");
    return;
  }

  users.forEach(user => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>•</td>
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>${user.status || ""}</td>
      <td><a href="user-profile.html?uid=${user.id}">View</a></td>
    `;
    userTableBody.appendChild(row);
  });

  console.log("✅ Rendered", users.length, "users into the table");
}

onAuthStateChanged(auth, async (user) => {
  console.log("🔐 Auth state changed:", user?.email || "no user");
  if (!user) {
    alert("You must be signed in.");
    window.location.href = "index.html";
    return;
  }

  currentUserEmail = user.email;
  console.log("👤 Logged in as:", currentUserEmail);

  allUsers = await loadUsers();
  renderTable(allUsers);
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  console.log("🚪 Logging out...");
  signOut(auth).then(() => window.location.href = "index.html");
});
