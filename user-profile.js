import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection
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

// DOM elements
const userInfo = document.getElementById("userInfo");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const roleSelect = document.getElementById("editRole");

const editFirstName = document.getElementById("editFirstName");
const editLastName = document.getElementById("editLastName");

const suspendBtn = document.getElementById("suspendBtn");
const signoutBtn = document.getElementById("signoutBtn");
const deleteBtn = document.getElementById("deleteBtn");

let currentUserId = null;
let currentUserData = null;

// Parse user ID from URL
const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get("uid");
if (!uid) {
  alert("No user ID provided.");
  window.location.href = "view-users.html";
}
currentUserId = uid;

// Load and display user info
async function loadUserProfile() {
  const userRef = doc(db, "users", currentUserId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    alert("User not found.");
    return;
  }

  const user = userSnap.data();
  currentUserData = user;

  userInfo.innerHTML = `
    <div>
      <span class="label">First Name</span>
      <span class="value" id="viewFirstName">${user.firstName || "-"}</span>
      <input type="text" id="editFirstName" value="${user.firstName || ""}" style="display: none;" />
    </div>
    <div>
      <span class="label">Last Name</span>
      <span class="value" id="viewLastName">${user.lastName || "-"}</span>
      <input type="text" id="editLastName" value="${user.lastName || ""}" style="display: none;" />
    </div>
    <div>
      <span class="label">Email</span>
      <span class="value" id="viewEmail">${user.email || "-"}</span>
    </div>
    <div>
      <span class="label">Role</span>
      <span class="value" id="viewRole">${user.role || "-"}</span>
      <select id="editRole" style="display: none;">
        <option value="cardholder">Cardholder</option>
        <option value="parent">Parent</option>
        <option value="vendor">Vendor</option>
        <option value="admin">Admin</option>
      </select>
    </div>
  `;

  // Set selected role
  const roleSelect = document.getElementById("editRole");
  if (roleSelect) roleSelect.value = user.role || "cardholder";

  // Re-assign editable inputs
  window.editFirstName = document.getElementById("editFirstName");
  window.editLastName = document.getElementById("editLastName");
  window.viewFirstName = document.getElementById("viewFirstName");
  window.viewLastName = document.getElementById("viewLastName");
  window.viewRole = document.getElementById("viewRole");
  window.editRole = document.getElementById("editRole");
}

// Toggle to edit mode
editBtn.addEventListener("click", () => {
  viewFirstName.style.display = "none";
  viewLastName.style.display = "none";
  viewRole.style.display = "none";

  editFirstName.style.display = "inline-block";
  editLastName.style.display = "inline-block";
  editRole.style.display = "inline-block";

  saveBtn.style.display = "inline-block";
});

// Save updated info
saveBtn.addEventListener("click", async () => {
  const updatedData = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    role: editRole.value
  };

  await updateDoc(doc(db, "users", currentUserId), updatedData);
  alert("User updated.");
  location.reload();
});

// Action handlers
suspendBtn?.addEventListener("click", async () => {
  const confirmed = confirm("Suspend this user?");
  if (confirmed) {
    await updateUserStatus("suspended");
  }
});

signoutBtn?.addEventListener("click", async () => {
  const confirmed = confirm("Force sign out this user?");
  if (confirmed) {
    await logAdminAction("signout");
    alert("Sign-out action recorded.");
  }
});

deleteBtn?.addEventListener("click", async () => {
  const input = prompt("Type DELETE to confirm deletion.");
  if (input === "DELETE") {
    await logAdminAction("delete");
    await deleteDoc(doc(db, "users", currentUserId));
    alert("User deleted.");
    window.location.href = "view-users.html";
  }
});

// Helpers
async function logAdminAction(action) {
  await addDoc(collection(db, "adminActions"), {
    uid: currentUserId,
    action,
    createdAt: new Date()
  });
}

async function updateUserStatus(status) {
  await logAdminAction(status === "suspended" ? "suspend" : "unsuspend");
  await updateDoc(doc(db, "users", currentUserId), { status });
  alert(`User status updated to ${status}`);
  location.reload();
}

// Auth check
onAuthStateChanged(auth, user => {
  if (user) {
    loadUserProfile();
  } else {
    window.location.href = "index.html";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
