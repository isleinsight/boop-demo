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
  addDoc,
  collection,
  query,
  where,
  getDocs
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

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM refs
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
const viewStatusEl = document.getElementById("viewStatus");

let editFirstName, editLastName, editEmail, editRole;
let currentUserId = new URLSearchParams(window.location.search).get("uid");
let currentUserData = null;

if (!currentUserId) {
  alert("User ID not found.");
  window.location.href = "view-users.html";
}

async function loadUserProfile() {
  const userRef = doc(db, "users", currentUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return alert("User not found.");
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

  // Field references after DOM update
  editFirstName = document.getElementById("editFirstName");
  editLastName = document.getElementById("editLastName");
  editEmail = document.getElementById("editEmail");
  editRole = document.getElementById("editRole");

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
}

async function loadAssignedStudents(parentId) {
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snap = await getDocs(q);
  if (snap.empty) {
    assignedStudentsList.innerHTML = "<div>No assigned students found.</div>";
    return;
  }

  assignedStudentsList.innerHTML = "";
  snap.forEach((doc) => {
    const student = doc.data();
    const div = document.createElement("div");
    div.innerHTML = `<span class="label">Name</span>
                     <span class="value"><a href="user-profile.html?uid=${doc.id}">${student.firstName} ${student.lastName}</a></span>`;
    assignedStudentsList.appendChild(div);
  });
}

// Edit Mode
editBtn?.addEventListener("click", () => {
  document.getElementById("viewFirstName").style.display = "none";
  document.getElementById("viewLastName").style.display = "none";
  document.getElementById("viewEmail").style.display = "none";
  document.getElementById("viewRole").style.display = "none";

  editFirstName.style.display = "block";
  editLastName.style.display = "block";
  editEmail.style.display = "block";
  editRole.style.display = "block";

  saveBtn.style.display = "inline-block";
});

// Save Profile
saveBtn?.addEventListener("click", async () => {
  const updated = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    email: editEmail.value.trim(),
    role: editRole.value
  };
  await updateDoc(doc(db, "users", currentUserId), updated);
  alert("Profile updated.");
  location.reload();
});

// Logout
logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

// Add Student Button
addStudentBtn?.addEventListener("click", () => {
  const form = document.getElementById("assignStudentForm");
  form.style.display = form.style.display === "none" ? "block" : "none";
});

// Auth Check
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadUserProfile();
  }
});
