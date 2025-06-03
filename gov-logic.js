console.log("gov-logic.js loaded");

// gov-logic.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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
const db = getFirestore(app);
const auth = getAuth(app);

// DOM elements
const usersTableBody = document.getElementById("usersTableBody");
const manageUsersBtn = document.getElementById("manageUsersBtn");
const addUserBtn = document.getElementById("addUserBtn");
const addUserFormDiv = document.getElementById("addUserForm");
const usersTableDiv = document.getElementById("usersTable");
const userForm = document.getElementById("userForm");

// Switch to user table view
manageUsersBtn.addEventListener("click", () => {
  usersTableDiv.style.display = "block";
  addUserFormDiv.style.display = "none";
});

// Switch to add user form view
addUserBtn.addEventListener("click", () => {
  usersTableDiv.style.display = "none";
  addUserFormDiv.style.display = "block";
});

// Load users and show them in the table
async function loadUsers() {
  usersTableBody.innerHTML = "";
  const querySnapshot = await getDocs(collection(db, "users"));
  querySnapshot.forEach((docSnap) => {
    const docData = docSnap.data();
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${docData.firstName || ""}</td>
      <td>${docData.lastName || ""}</td>
      <td>${docData.email || ""}</td>
      <td>${docData.role || ""}</td>
      <td>${docData.walletAddress || ""}</td>
      <td>${docData.addedBy || "N/A"}</td>
      <td><button class="actions-button" onclick="deleteUser('${docSnap.id}')">Delete</button></td>
    `;

    usersTableBody.appendChild(row);
  });
}

// Add user to Firestore
userForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const role = document.getElementById("role").value;
  const walletAddress = document.getElementById("walletAddress").value.trim();

  const usersCollection = collection(db, "users");
  const currentUser = auth.currentUser;

  try {
    await addDoc(usersCollection, {
      firstName,
      lastName,
      email,
      role,
      walletAddress,
      addedBy: currentUser ? currentUser.email : "Unknown"
    });

    userForm.reset();
    usersTableDiv.style.display = "block";
    addUserFormDiv.style.display = "none";
    loadUsers();
  } catch (error) {
    console.error("Error adding user:", error);
  }
});

// Delete user function
window.deleteUser = async (userId) => {
  const confirmDelete = confirm("Are you sure you want to delete this user?");
  if (!confirmDelete) return;

  try {
    await deleteDoc(doc(db, "users", userId));
    loadUsers();
  } catch (error) {
    console.error("Error deleting user:", error);
  }
};

// Run loadUsers only if user is authenticated
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUsers();
  } else {
    window.location.href = "index.html"; // Redirect to home if not logged in
  }
});


// Show the Add User Form
function showAddUserForm() {
  document.getElementById("addUserFormContainer").style.display = "block";
  document.getElementById("usersTable").style.display = "none";
}

// Show the Users Table
function showManageUsers() {
  document.getElementById("addUserFormContainer").style.display = "none";
  document.getElementById("usersTable").style.display = "block";
  fetchUsers(); // Load user data into the table
}


<button onclick="showAddUserForm()">Add User</button>
<button onclick="showManageUsers()">Manage Users</button>
