import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// Load users into the table
async function loadUsers() {
  const tableBody = document.querySelector("#userTable tbody");
  tableBody.innerHTML = ""; // Clear existing rows

  const usersSnapshot = await getDocs(collection(db, "users"));
  usersSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${data.firstName || ""}</td>
      <td>${data.lastName || ""}</td>
      <td>${data.email || ""}</td>
      <td>${data.role || ""}</td>
      <td>${data.walletAddress || ""}</td>
      <td>
        <button class="editBtn" data-id="${docSnap.id}">Edit</button>
        <button class="deleteBtn" data-id="${docSnap.id}">Delete</button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  // Set up button actions
  document.querySelectorAll(".editBtn").forEach((btn) =>
    btn.addEventListener("click", handleEdit)
  );
  document.querySelectorAll(".deleteBtn").forEach((btn) =>
    btn.addEventListener("click", handleDelete)
  );
}

// Delete user with confirmation
async function handleDelete(e) {
  const id = e.target.getAttribute("data-id");
  if (confirm("Are you sure you want to delete this user?")) {
    await deleteDoc(doc(db, "users", id));
    loadUsers();
  }
}

// Add user from form
document.getElementById("addUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const newUser = {
    firstName: document.getElementById("firstName").value.trim(),
    lastName: document.getElementById("lastName").value.trim(),
    email: document.getElementById("email").value.trim(),
    role: document.getElementById("role").value,
    walletAddress: document.getElementById("walletAddress").value.trim(),
  };

  try {
    await addDoc(collection(db, "users"), newUser);
    document.getElementById("addUserForm").reset();
    loadUsers();
  } catch (error) {
    alert("Error adding user: " + error.message);
  }
});

// Stub for future edit feature
function handleEdit(e) {
  alert("Edit feature coming soon!");
}

// Load on page start
loadUsers();
