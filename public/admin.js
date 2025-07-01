console.log("🔥 admin.js has loaded!");

document.addEventListener("DOMContentLoaded", () => {
  // ✅ Check if user is logged in and is admin
  const userData = JSON.parse(localStorage.getItem('boopUser'));
  
  if (!userData || userData.role !== 'admin') {
    alert("Access denied. You must be an admin to access this page.");
    window.location.href = "admin-login.html";
    return;
  }

  console.log(`✅ Logged in as: ${userData.email}`);
  loadUsers(); // Load users immediately
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
    const response = await fetch("/api/users"); // Adjust this if your backend expects something else
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
    const currentUser = JSON.parse(localStorage.getItem("boopUser"));
    
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
        // TODO: Include JWT if using
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        role,
        walletAddress,
        addedBy: currentUser?.email || "unknown"
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
    const response = await fetch(`/api/users/${userId}`, {
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

// Logout
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("boopUser");
  window.location.href = "index.html";
});
