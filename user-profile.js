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

const userInfo = document.getElementById("userInfo");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");
const actionsDropdown = document.getElementById("actionsDropdown");

let editFirstName, editLastName, editRole, editEmail;
let viewFirstName, viewLastName, viewRole, viewEmail, viewStatus;
let currentUserId = null;
let currentUserData = null;

const uid = new URLSearchParams(window.location.search).get("uid");
if (!uid) {
  alert("User ID not found.");
  window.location.href = "view-users.html";
}
currentUserId = uid;

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
      <input type="text" id="editEmail" value="${user.email || ""}" style="display: none; width: 100%;" />
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
    <div>
      <span class="label">Status</span>
      <span class="value" id="viewStatus" style="color: ${user.status === "suspended" ? "#e74c3c" : "#27ae60"};">
        ${user.status === "suspended" ? "Suspended" : "Active"}
      </span>
    </div>
  `;

  // Update dropdown menu
  const isSuspended = user.status === "suspended";
  actionsDropdown.innerHTML = `
    <a href="#" id="toggleSuspendBtn">${isSuspended ? "Unsuspend" : "Suspend"}</a>
    <a href="#" id="signoutBtn">Force Sign-out</a>
    <a href="#" id="deleteBtn" style="color: red;">Delete</a>
  `;

  editFirstName = document.getElementById("editFirstName");
  editLastName = document.getElementById("editLastName");
  editRole = document.getElementById("editRole");
  editEmail = document.getElementById("editEmail");

  viewFirstName = document.getElementById("viewFirstName");
  viewLastName = document.getElementById("viewLastName");
  viewRole = document.getElementById("viewRole");
  viewEmail = document.getElementById("viewEmail");

  if (editRole) editRole.value = user.role || "cardholder";
}

editBtn?.addEventListener("click", () => {
  if (!editFirstName || !editLastName || !editRole || !editEmail) return;

  viewFirstName.style.display = "none";
  viewLastName.style.display = "none";
  viewRole.style.display = "none";
  viewEmail.style.display = "none";

  editFirstName.style.display = "block";
  editLastName.style.display = "block";
  editRole.style.display = "block";
  editEmail.style.display = "block";

  saveBtn.style.display = "inline-block";
});

saveBtn?.addEventListener("click", async () => {
  if (!editFirstName || !editLastName || !editRole || !editEmail) return;

  const updatedData = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    role: editRole.value,
    email: editEmail.value.trim()
  };

  await updateDoc(doc(db, "users", currentUserId), updatedData);
  alert("Profile updated.");
  location.reload();
});

document.addEventListener("click", async (e) => {
  if (e.target.id === "toggleSuspendBtn") {
    e.preventDefault();
    const action = currentUserData.status === "suspended" ? "unsuspend" : "suspend";
    const confirmed = confirm(`${action === "suspend" ? "Suspend" : "Unsuspend"} this user?`);
    if (!confirmed) return;

    await logAdminAction(action);
    const newStatus = action === "suspend" ? "suspended" : "active";
    await updateDoc(doc(db, "users", currentUserId), { status: newStatus });

    alert(`User ${newStatus === "suspended" ? "suspended" : "unsuspended"}.`);
    location.reload();
  }

  if (e.target.id === "signoutBtn") {
    e.preventDefault();
    const confirmed = confirm("Force sign out?");
    if (confirmed) {
      await logAdminAction("signout");
      alert("Sign-out action recorded.");
    }
  }

  if (e.target.id === "deleteBtn") {
    e.preventDefault();
    const input = prompt("Type DELETE to confirm.");
    if (input === "DELETE") {
      await logAdminAction("delete");
      await deleteDoc(doc(db, "users", currentUserId));
      alert("User deleted.");
      window.location.href = "view-users.html";
    }
  }
});

async function logAdminAction(action) {
  await addDoc(collection(db, "adminActions"), {
    uid: currentUserId,
    action,
    createdAt: new Date()
  });
}

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

onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadUserProfile();
  }
});

logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
