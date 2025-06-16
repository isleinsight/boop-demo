import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, collection, addDoc, deleteDoc,
  query, where, getDocs
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

// DOM Elements
const userInfo = document.getElementById("userInfo");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");
const editFields = document.getElementById("editFields");
const parentSection = document.getElementById("parentSection");
const studentSection = document.getElementById("studentSection");
const parentName = document.getElementById("parentName");
const parentEmail = document.getElementById("parentEmail");
const assignedStudentsList = document.getElementById("assignedStudentsList");

// User ID
let currentUserId = null;
let currentUserData = null;

const uid = new URLSearchParams(window.location.search).get("uid");
if (!uid) {
  alert("User ID not found.");
  window.location.href = "view-users.html";
}
currentUserId = uid;


async function loadUserProfile() {
  const docRef = doc(db, "users", currentUserId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    alert("User not found.");
    return;
  }

  const user = docSnap.data();
  currentUserData = user;

  const statusColor = user.status === "suspended" ? "red" : "green";

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
      <input type="email" id="editEmail" value="${user.email || ""}" style="display: none;" />
    </div>
    <div>
      <span class="label">Role</span>
      <span class="value" id="viewRole">${user.role || "-"}</span>
      <select id="editRole" style="display: none;">
        <option value="cardholder">Cardholder</option>
        <option value="parent">Parent</option>
        <option value="vendor">Vendor</option>
        <option value="admin">Admin</option>
        <option value="student">Student</option>
      </select>
    </div>
    <div>
      <span class="label">Status</span>
      <span class="value" style="color: ${statusColor}; font-weight: bold;">${user.status || "active"}</span>
    </div>
  `;

  // Assign DOM refs for editing
  window.editFirstName = document.getElementById("editFirstName");
  window.editLastName = document.getElementById("editLastName");
  window.editEmail = document.getElementById("editEmail");
  window.editRole = document.getElementById("editRole");

  // Parent logic
  if (user.role === "student" && user.parentId) {
    const parentSnap = await getDoc(doc(db, "users", user.parentId));
    if (parentSnap.exists()) {
      const parent = parentSnap.data();
      parentSection.style.display = "block";
      parentName.innerHTML = `<a href="user-profile.html?uid=${user.parentId}">${parent.firstName} ${parent.lastName}</a>`;
      parentEmail.textContent = parent.email || "-";
    }
  }

  // Student logic
  if (user.role === "parent") {
    studentSection.style.display = "block";
    const q = query(collection(db, "users"), where("parentId", "==", currentUserId));
    const studentSnap = await getDocs(q);
    if (!studentSnap.empty) {
      assignedStudentsList.innerHTML = "";
      studentSnap.forEach(doc => {
        const student = doc.data();
        const div = document.createElement("div");
        div.innerHTML = `
          <span class="label">Name</span>
          <span class="value"><a href="user-profile.html?uid=${doc.id}">${student.firstName || ""} ${student.lastName || ""}</a></span>
        `;
        assignedStudentsList.appendChild(div);
      });
    }
  }
}

// Mount load function after auth
onAuthStateChanged(auth, user => {
  if (!user) return (window.location.href = "index.html");
  loadUserProfile();
});

editBtn?.addEventListener("click", () => {
  if (!editFirstName || !editLastName || !editRole) return;

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
