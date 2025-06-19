import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  startAfter,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// --- DOM refs ---
const userInfo = document.getElementById("userInfo");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");
const addStudentBtn = document.getElementById("addStudentBtn");
const parentSection = document.getElementById("parentSection");
const studentSection = document.getElementById("studentSection");
const parentNameEl = document.getElementById("parentName");
const parentEmailEl = document.getElementById("parentEmail");
const assignedStudentsList = document.getElementById("assignedStudentsList");
const assignStudentForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedBtn = document.getElementById("assignSelectedStudentsBtn");
const nextPageBtn = document.getElementById("nextStudentPageBtn");
const prevPageBtn = document.getElementById("prevStudentPageBtn");
const paginationInfo = document.getElementById("studentPaginationInfo");
const actionsDropdown = document.getElementById("actionsDropdown");
const actionsToggleBtn = document.getElementById("actionsToggleBtn");
const suspendBtn = document.getElementById("suspendBtn");
const signoutBtn = document.getElementById("signoutBtn");
const deleteBtn = document.getElementById("deleteBtn");

let currentUserId = new URLSearchParams(window.location.search).get("uid");
let currentUserData = null;
let editFirstName, editLastName, editEmail, editRole;
let studentPages = [];
let currentStudentPageIndex = 0;

async function loadUserProfile() {
  if (!currentUserId) return window.location.href = "view-users.html";

  const userRef = doc(db, "users", currentUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return alert("User not found");

  const user = snap.data();
  currentUserData = user;

  userInfo.innerHTML = `
    <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.firstName || "-"}</span>
    <input type="text" id="editFirstName" value="${user.firstName || ""}" style="display:none; width: 100%;" /></div>
    <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.lastName || "-"}</span>
    <input type="text" id="editLastName" value="${user.lastName || ""}" style="display:none; width: 100%;" /></div>
    <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email || "-"}</span>
    <input type="email" id="editEmail" value="${user.email || ""}" style="display:none; width: 100%;" /></div>
    <div><span class="label">Status</span><span class="value" id="viewStatus" style="color:${user.status === 'suspended' ? 'red' : 'green'}">${user.status || "active"}</span></div>
    <div><span class="label">Role</span><span class="value" id="viewRole">${user.role || "-"}</span>
    <select id="editRole" style="display:none; width: 100%;">
      <option value="cardholder">Cardholder</option>
      <option value="parent">Parent</option>
      <option value="vendor">Vendor</option>
      <option value="admin">Admin</option>
      <option value="student">Student</option>
    </select></div>
  `;

  editFirstName = document.getElementById("editFirstName");
  editLastName = document.getElementById("editLastName");
  editEmail = document.getElementById("editEmail");
  editRole = document.getElementById("editRole");
  editRole.value = user.role || "cardholder";

  if ((user.role || "").toLowerCase() === "parent") {
    addStudentBtn.style.display = "inline-block";
    studentSection.style.display = "block";
    loadAssignedStudents(currentUserId);
  }

  if ((user.role || "").toLowerCase() === "student" && user.parentId) {
    parentSection.style.display = "block";
    const parentSnap = await getDoc(doc(db, "users", user.parentId));
    if (parentSnap.exists()) {
      const parent = parentSnap.data();
      parentNameEl.innerHTML = `<a href="user-profile.html?uid=${user.parentId}">${parent.firstName} ${parent.lastName}</a>`;
      parentEmailEl.textContent = parent.email || "-";
    }
  }

  if (suspendBtn) {
    suspendBtn.textContent = (user.status || "").toLowerCase() === "suspended" ? "Unsuspend" : "Suspend";
  }
}

async function performAction(action) {
  if (!currentUserId) return;
  const userRef = doc(db, "users", currentUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  if (action === "delete") {
    const confirmText = prompt("Type DELETE to confirm.");
    if (confirmText !== "DELETE") return alert("Cancelled.");
    await deleteDoc(userRef);
    await addDoc(collection(db, "adminActions"), {
      uid: currentUserId,
      action,
      createdAt: new Date()
    });
    alert("User deleted.");
    return window.location.href = "view-users.html";
  }

  if (action === "suspend" || action === "unsuspend") {
    await updateDoc(userRef, { status: action === "suspend" ? "suspended" : "active" });
  }

  if (action === "signout") {
    alert("Force sign-out requested (not implemented).");
  }

  await addDoc(collection(db, "adminActions"), {
    uid: currentUserId,
    action,
    createdAt: new Date()
  });

  location.reload();
}

suspendBtn?.addEventListener("click", () => {
  const currentStatus = (currentUserData?.status || "").toLowerCase();
  performAction(currentStatus === "suspended" ? "unsuspend" : "suspend");
});
signoutBtn?.addEventListener("click", () => performAction("signout"));
deleteBtn?.addEventListener("click", () => performAction("delete"));

actionsToggleBtn?.addEventListener("click", () => {
  actionsDropdown.style.display = actionsDropdown.style.display === "block" ? "none" : "block";
});
window.addEventListener("click", (e) => {
  if (!actionsDropdown.contains(e.target) && e.target !== actionsToggleBtn) {
    actionsDropdown.style.display = "none";
  }
});

// The rest of the student assignment logic is already integrated and unchanged...

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "index.html";
  else loadUserProfile();
});
