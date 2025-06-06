// Firebase v10 imports
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
  setDoc,
  collection,
  query,
  where,
  limit
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
const db = getFirestore(app);
const auth = getAuth(app);

// Get UID from URL
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

// DOM Elements
const userInfoContainer = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");
const studentSection = document.getElementById("studentSection");
const addStudentBtn = document.getElementById("addStudentBtn");
const assignForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");
const assignedStudentsList = document.getElementById("assignedStudentsList");

let currentUser = null;
let studentDocs = [];
let currentPage = 0;
const studentsPerPage = 5;

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadUserProfile(uid);
  } else {
    window.location.href = "index.html";
  }
});

async function loadUserProfile(uid) {
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return;

  currentUser = { id: docSnap.id, ...docSnap.data() };
  renderUserInfo(currentUser);

  if (currentUser.role === "parent") {
    studentSection.style.display = "block";
    addStudentBtn.style.display = "inline-block";
    renderAssignedStudents();
  }

  if (currentUser.role === "student" && currentUser.parentId) {
    const parentDoc = await getDoc(doc(db, "users", currentUser.parentId));
    if (parentDoc.exists()) {
      const parent = parentDoc.data();
      const section = document.createElement("div");
      section.innerHTML = `
        <div class="section-title">Parent</div>
        <div class="user-details-grid">
          <div><span class="label">Name</span><span class="value"><a href="user-profile.html?uid=${parentDoc.id}">${parent.firstName} ${parent.lastName}</a></span></div>
          <div><span class="label">Email</span><span class="value">${parent.email}</span></div>
        </div>`;
      const walletTitle = document.querySelector(".section-title:nth-of-type(2)");
      walletTitle?.parentNode.insertBefore(section, walletTitle);
    }
  }
}

function renderUserInfo(user) {
  userInfoContainer.innerHTML = `
    <div><span class="label">Name</span><span class="value">${user.firstName || ""} ${user.lastName || ""}</span></div>
    <div><span class="label">Email</span><span class="value">${user.email || "-"}</span></div>
    <div><span class="label">Role</span><span class="value">${user.role || "-"}</span></div>
  `;
}

// Add Student Button
addStudentBtn.addEventListener("click", () => {
  assignForm.style.display = "block";
  loadStudents();
});

// Load students for assignment
async function loadStudents() {
  const q = query(collection(db, "users"), where("role", "==", "student"));
  const snap = await getDocs(q);
  studentDocs = snap.docs;
  currentPage = 0;
  renderStudentPage();
}

function renderStudentPage() {
  studentSearchResults.innerHTML = "";
  const start = currentPage * studentsPerPage;
  const current = studentDocs.slice(start, start + studentsPerPage);

  for (const docSnap of current) {
    const s = docSnap.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.firstName}</td>
      <td>${s.lastName}</td>
      <td>${s.email}</td>
      <td><input type="checkbox" value="${docSnap.id}" /></td>`;
    studentSearchResults.appendChild(row);
  }

  const pagination = document.createElement("tr");
  pagination.innerHTML = `
    <td colspan="4" style="text-align: center;">
      <button ${currentPage === 0 ? "disabled" : ""} id="prevBtn">Previous</button>
      <button ${(currentPage + 1) * studentsPerPage >= studentDocs.length ? "disabled" : ""} id="nextBtn">Next</button>
    </td>`;
  studentSearchResults.appendChild(pagination);

  setTimeout(() => {
    document.getElementById("prevBtn")?.addEventListener("click", () => {
      currentPage--;
      renderStudentPage();
    });
    document.getElementById("nextBtn")?.addEventListener("click", () => {
      currentPage++;
      renderStudentPage();
    });
  }, 0);
}

// Assign selected students
assignSelectedStudentsBtn.addEventListener("click", async () => {
  const selected = document.querySelectorAll("#studentSearchResults input[type='checkbox']:checked");
  for (const checkbox of selected) {
    await updateDoc(doc(db, "users", checkbox.value), { parentId: currentUser.id });
  }
  assignForm.style.display = "none";
  renderAssignedStudents();
});

// Show assigned students
async function renderAssignedStudents() {
  const q = query(collection(db, "users"), where("parentId", "==", currentUser.id));
  const snap = await getDocs(q);
  assignedStudentsList.innerHTML = "";

  snap.forEach((docSnap) => {
    const s = docSnap.data();
    const box = document.createElement("div");
    box.className = "user-details-grid";
    box.innerHTML = `
      <div><span class="label">Student</span><a class="value" href="user-profile.html?uid=${docSnap.id}">${s.firstName || ""} ${s.lastName || ""}</a></div>
      <div><span class="label">Email</span><span class="value">${s.email || ""}</span></div>
      <div><button onclick="removeStudent('${docSnap.id}')">Remove</button></div>
    `;
    assignedStudentsList.appendChild(box);
  });
}

window.removeStudent = async (studentId) => {
  await updateDoc(doc(db, "users", studentId), { parentId: "" });
  renderAssignedStudents();
};

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
