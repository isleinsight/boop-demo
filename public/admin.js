console.log("🔥 admin.js has loaded!");

document.addEventListener("DOMContentLoaded", () => {
  alert("If you see this, JavaScript is running!");
  loadUsers(); // Load users immediately on page load for now
});

// DOM elements
const usersTableBody = document.getElementById("usersTableBody");
const manageUsersBtn = document.getElementById("manageUsersBtn");
const addUserBtn = document.getElementById("addUserBtn");
const addUserFormDiv = document.getElementById("addUserForm");
const usersTableDiv = document.getElementById("usersTable");
const userForm = document.getElementById("userForm");
const logoutBtn = document.getElementById("logoutBtn");

// Show the Add User Form
function showAddUserForm() {
  addUserFormDiv.style.display = "block";
  usersTableDiv.style.display = "none";
}

// Show the Users Table
function showManageUsers() {
  addUserFormDiv.style.display = "none";
  usersTableDiv.style.display = "block";
  loadUsers();
}

// Event listeners for switching views
manageUsersBtn.addEventListener("click", showManageUsers);
addUserBtn.addEventListener("click", showAddUserForm);

// Load users from backend API
async function loadUsers() {
  usersTableBody.innerHTML = "";

  try {
    const response = await fetch("https://boop-api-6moct.ondigitalocean.app/api/users");
    const users = await response.json();

    users.forEach((user) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.firstName || ""}</td>
        <td>${user.lastName || ""}</td>
        <td>${user.email || ""}</td>
        <td>${user.role || ""}</td>
        <td>${user.walletAddress || ""}</td>
        <td>${user.addedBy || "N/A"}</td>
        <td><button class="actions-button" onclick="deleteUser('${user.id}')">Delete</button></td>
      `;
      usersTableBody.appendChild(row);
    });
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

// Add a new user using the API
userForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const role = document.getElementById("role").value;
  const walletAddress = document.getElementById("walletAddress").value.trim();

  try {
    const response = await fetch("https://boop-api-6moct.ondigitalocean.app/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
        // Add Authorization header here later if using JWT
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        role,
        walletAddress,
        addedBy: "admin@example.com" // Replace this later with real user email from JWT
      })
    });

    if (response.ok) {
      userForm.reset();
      showManageUsers();
    } else {
      const err = await response.json();
      console.error("Error adding user:", err);
      alert("Failed to add user: " + (err.message || "Unknown error"));
    }
  } catch (error) {
    console.error("Error adding user:", error);
  }
});

// Delete a user
window.deleteUser = async (userId) => {
  const confirmDelete = confirm("Are you sure you want to delete this user?");
  if (!confirmDelete) return;

  try {
    const response = await fetch(`https://boop-api-6moct.ondigitalocean.app/api/users/${userId}`, {
      method: "DELETE"
    });

    if (response.ok) {
      loadUsers();
    } else {
      const err = await response.text();
      console.error("Error deleting user:", err);
    }
  } catch (error) {
    console.error("Error deleting user:", error);
  }
};

// Logout handler (you can update this when JWT is implemented)
logoutBtn?.addEventListener("click", () => {
  window.location.href = "index.html"; // Or clear JWT token when implemented
});

// Future: Admin action requests (still Firebase-based, will migrate later)
import { requestAdminAction } from './government-actions.js';

document.getElementById("deleteUserBtn")?.addEventListener("click", () => {
  const uid = document.getElementById("targetUid").value;
  requestAdminAction(uid, "delete");
});

document.getElementById("suspendUserBtn")?.addEventListener("click", () => {
  const uid = document.getElementById("targetUid").value;
  requestAdminAction(uid, "suspend");
});

document.getElementById("unsuspendUserBtn")?.addEventListener("click", () => {
  const uid = document.getElementById("targetUid").value;
  requestAdminAction(uid, "unsuspend");
});

document.getElementById("forceSignoutBtn")?.addEventListener("click", () => {
  const uid = document.getElementById("targetUid").value;
  requestAdminAction(uid, "forceSignout");
});
