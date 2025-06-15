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

// DOM refs
const userInfo = document.getElementById("userInfo");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");

let editFirstName, editLastName, editRole;
let viewFirstName, viewLastName, viewRole;
let currentUserId = null;
let currentUserData = null;

// Get UID from URL
const uid = new URLSearchParams(window.location.search).get("uid");
if (!uid) {
  alert("User ID not found.");
  window.location.href = "view-users.html";
}
currentUserId = uid;

// Load user info
async function loadUserProfile() {
  const userRef = doc(db, "users", currentUserId);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    alert("User not found.");
    return;
  }

  const user = snap.data();
  currentUserData = user;

  userInfo.innerHTML = `
    <div>
      <span class="label">First Name</span>
      <span class="value" id="viewFirstName">${user.firstName || "-"}</span>
      <input type="text" id="editFirstName" value="${user.firstName || ""}" style="display: none; width: 100%;" />
    </div>
    <div>
      <span class="label">Last Name</span>
      <span class="value" id="viewLastName">${user.lastName || "-"}</span>
      <input type="text" id="editLastName" value="${user.lastName || ""}" style="display: none; width: 100%;" />
    </div>
    <div>
      <span class="label">Email</span>
      <span class="value" id="viewEmail">${user.email || "-"}</span>
    </div>
    <div>
      <span class="label">Role</span>
      <span class="value" id="viewRole">${user.role || "-"}</span>
      <select id="editRole" style="display: none; width: 100%;">
        <option value="cardholder">Cardholder</option>
        <option value="parent">Parent</option>
        <option value="vendor">Vendor</option>
        <option value="admin">Admin</option>
      </select>
    </div>
  `;

  // Assign after DOM is updated
  editFirstName = document.getElementById("editFirstName");
  editLastName = document.getElementById("editLastName");
  editRole = document.getElementById("editRole");

  viewFirstName = document.getElementById("viewFirstName");
  viewLastName = document.getElementById("viewLastName");
  viewRole = document.getElementById("viewRole");

  if (editRole) editRole.value = user.role || "cardholder";
}

// Enable edit mode
editBtn?.addEventListener("click", () => {
  if (!editFirstName || !editLastName || !editRole) return;

  viewFirstName.style.display = "none";
  viewLastName.style.display = "none";
  viewRole.style.display = "none";

  editFirstName.style.display = "block";
  editLastName.style.display = "block";
  editRole.style.display = "block";

  saveBtn.style.display = "inline-block";
});

// Save edits
saveBtn?.addEventListener("click", async () => {
  if (!editFirstName || !editLastName || !editRole) return;

  const updatedData = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    role: editRole.value
  };

  await updateDoc(doc(db, "users", currentUserId), updatedData);
  alert("Profile updated.");
  location.reload();
});

// Action buttons (Suspend, Signout, Delete)
document.getElementById("suspendBtn")?.addEventListener("click", async () => {
  const confirmed = confirm("Suspend this user?");
  if (confirmed) {
    await logAdminAction("suspend");
    await updateDoc(doc(db, "users", currentUserId), { status: "suspended" });
    alert("User suspended.");
    location.reload();
  }
});

document.getElementById("signoutBtn")?.addEventListener("click", async () => {
  const confirmed = confirm("Force sign out?");
  if (confirmed) {
    await logAdminAction("signout");
    alert("Sign-out action recorded.");
  }
});

document.getElementById("deleteBtn")?.addEventListener("click", async () => {
  const input = prompt("Type DELETE to confirm.");
  if (input === "DELETE") {
    await logAdminAction("delete");
    await deleteDoc(doc(db, "users", currentUserId));
    alert("User deleted.");
    window.location.href = "view-users.html";
  }
});

// Action log helper
async function logAdminAction(action) {
  await addDoc(collection(db, "adminActions"), {
    uid: currentUserId,
    action,
    createdAt: new Date()
  });
}

// Toggle dropdown
document.getElementById("actionsToggleBtn")?.addEventListener("click", () => {
  const dropdown = document.getElementById("actionsDropdown");
  dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", (e) => {
  const toggle = document.getElementById("actionsToggleBtn");
  const menu = document.getElementById("actionsDropdown");
  if (!toggle || !menu) return;

  if (!toggle.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = "none";
  }
});

// Auth check
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadUserProfile();
  }
});

// Logout
logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
