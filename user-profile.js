import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where
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

// Get UID from URL
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

// DOM elements
const userInfoContainer = document.getElementById("userInfo");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const editFields = document.getElementById("editFields");
const addStudentBtn = document.getElementById("addStudentBtn");
const toggleAssignFormBtn = document.getElementById("toggleAssignFormBtn");
const assignStudentForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");
const assignedStudentsList = document.getElementById("assignedStudentsList");

function showUserInfo(user) {
  userInfoContainer.innerHTML = `
    <div>
      <span class="label">Name</span>
      <span class="value">${user.firstName || ""} ${user.lastName || ""}</span>
    </div>
    <div>
      <span class="label">Email</span>
      <span class="value">${user.email || "-"}</span>
    </div>
    <div>
      <span class="label">Role</span>
      <span class="value">${user.role || "-"}</span>
    </div>
    <div>
      <span class="label">Wallet Address</span>
      <span class="value">${user.walletAddress || "-"}</span>
    </div>
    <div>
      <span class="label">Added By</span>
      <span class="value">${user.addedBy || "-"}</span>
    </div>
    <div>
      <span class="label">Created At</span>
      <span class="value">${user.createdAt?.toDate().toLocaleString() || "-"}</span>
    </div>
  `;

  document.getElementById("editFirstName").value = user.firstName || "";
  document.getElementById("editLastName").value = user.lastName || "";
  document.getElementById("editRole").value = user.role || "cardholder";
}

async function loadAssignedStudents() {
  const q = query(collection(db, "users"), where("parentId", "==", uid));
  const snap = await getDocs(q);
  assignedStudentsList.innerHTML = "";
  snap.forEach(doc => {
    const student = doc.data();
    const div = document.createElement("div");
    div.innerHTML = `
      <span class="label">${student.firstName || ""} ${student.lastName || ""}</span>
      <span class="value">${student.email || ""}</span>
    `;
    assignedStudentsList.appendChild(div);
  });
}

async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    alert("User not found");
    return;
  }

  const user = userDoc.data();
  showUserInfo(user);

  if (user.role === "parent") {
    addStudentBtn.style.display = "inline-block";
    toggleAssignFormBtn.style.display = "inline-block";
    document.getElementById("studentSection").style.display = "block";
    loadAssignedStudents();
  }
}

// Event listeners
editBtn.addEventListener("click", () => {
  editFields.style.display = "block";
  userInfoContainer.style.display = "none";
  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
});

addStudentBtn.addEventListener("click", () => {
  assignStudentForm.style.display = "block";
});

toggleAssignFormBtn.addEventListener("click", () => {
  assignStudentForm.style.display = assignStudentForm.style.display === "none" ? "block" : "none";
});

studentSearchBtn.addEventListener("click", async () => {
  const term = studentSearchInput.value.trim().toLowerCase();
  const q = query(collection(db, "users"), where("role", "==", "student"));
  const snap = await getDocs(q);

  studentSearchResults.innerHTML = "";
  snap.forEach(docSnap => {
    const student = docSnap.data();
    const name = `${student.firstName || ""} ${student.lastName || ""}`.toLowerCase();
    const email = (student.email || "").toLowerCase();
    if (name.includes(term) || email.includes(term)) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${student.firstName || ""}</td>
        <td>${student.lastName || ""}</td>
        <td>${student.email || ""}</td>
        <td><input type="checkbox" data-id="${docSnap.id}" /></td>
      `;
      studentSearchResults.appendChild(row);
    }
  });
});

assignSelectedStudentsBtn.addEventListener("click", async () => {
  const checkboxes = studentSearchResults.querySelectorAll("input[type='checkbox']:checked");
  for (let cb of checkboxes) {
    const studentId = cb.getAttribute("data-id");
    await updateDoc(doc(db, "users", studentId), {
      parentId: uid
    });
  }
  alert("Students assigned.");
  loadAssignedStudents();
  assignStudentForm.style.display = "none";
});

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUserProfile(uid);
  } else {
    window.location.href = "index.html";
  }
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
