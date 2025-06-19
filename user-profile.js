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
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  startAfter
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
// DOM elements
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
const paginationContainer = document.getElementById("paginationContainer");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const nextPageBtn = document.getElementById("nextStudentPageBtn");
const prevPageBtn = document.getElementById("prevStudentPageBtn");
const paginationInfo = document.getElementById("studentPaginationInfo");

let editFirstName, editLastName, editEmail, editRole;
let currentUserId = new URLSearchParams(window.location.search).get("uid");
let currentPage = 1;
let studentsPerPage = 5;
let lastVisibleDoc = null;
let pageMap = [];
let currentUserData = null;

async function fetchStudents(page = 1) {
  let q = query(
    collection(db, "users"),
    where("role", "==", "student"),
    orderBy("firstName"),
    limit(studentsPerPage)
  );
if (!currentUserId) {
  alert("User ID not found.");
  window.location.href = "view-users.html";
}

  if (pageMap[page - 2]) {
    q = query(q, startAfter(pageMap[page - 2]));
  }
async function loadUserProfile() {
  if (!currentUserId) {
    alert("User ID not found.");
    window.location.href = "view-users.html";
    return;
  }

  const userRef = doc(db, "users", currentUserId);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    alert("User not found.");
    return;
  }

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

  // Update global refs to the edit inputs
  editFirstName = document.getElementById("editFirstName");
  editLastName = document.getElementById("editLastName");
  editEmail = document.getElementById("editEmail");
  editRole = document.getElementById("editRole");

  // Role-based extra sections
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

function renderStudents(docs) {
  studentSearchResults.innerHTML = "";
  if (!docs.length) {
    studentSearchResults.innerHTML = "<tr><td colspan='4'>No students found.</td></tr>";
async function loadAssignedStudents(parentId) {
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snap = await getDocs(q);
  assignedStudentsList.innerHTML = "";

  if (snap.empty) {
    assignedStudentsList.innerHTML = "<div>No assigned students found.</div>";
    return;
  }

  docs.forEach(docSnap => {
    const s = docSnap.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.firstName || "-"}</td>
      <td>${s.lastName || "-"}</td>
      <td>${s.email || "-"}</td>
      <td><input type="checkbox" value="${docSnap.id}" /></td>
  snap.forEach((docSnap) => {
    const student = docSnap.data();
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";
    div.style.gap = "10px";

    div.innerHTML = `
      <div>
        <span class="label">Name</span>
        <span class="value"><a href="user-profile.html?uid=${docSnap.id}">${student.firstName} ${student.lastName}</a></span>
      </div>
      <button class="student-remove-btn" data-id="${docSnap.id}">Remove</button>
    `;
    studentSearchResults.appendChild(row);

    assignedStudentsList.appendChild(div);
  });

  assignedStudentsList.querySelectorAll(".student-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const studentId = btn.getAttribute("data-id");
      if (confirm("Remove this student?")) {
        await updateDoc(doc(db, "users", studentId), { parentId: null });
        loadAssignedStudents(parentId);
      }
    });
  });
}

function renderPaginationControls() {
  paginationContainer.innerHTML = "";
// Edit Mode
editBtn?.addEventListener("click", () => {
  document.getElementById("viewFirstName").style.display = "none";
  document.getElementById("viewLastName").style.display = "none";
  document.getElementById("viewEmail").style.display = "none";
  document.getElementById("viewRole").style.display = "none";

  for (let i = 1; i <= pageMap.length + 1; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.classList.add("page-btn");
    if (i === currentPage) btn.classList.add("active");
  editFirstName.style.display = "block";
  editLastName.style.display = "block";
  editEmail.style.display = "block";
  editRole.style.display = "block";
  saveBtn.style.display = "inline-block";
});

    btn.addEventListener("click", async () => {
      currentPage = i;
      const docs = await fetchStudents(i);
      renderStudents(docs);
      renderPaginationControls();
    });
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

    paginationContainer.appendChild(btn);
logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

addStudentBtn?.addEventListener("click", () => {
  assignStudentForm.style.display = "block";
  assignStudentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  loadStudentSearch(true);
});

// Pagination logic
let searchQuery = "";
let studentPages = [];
let currentPageIndex = 0;
let cachedStudentResults = [];

async function fetchStudentsPage(startAfterDoc = null) {
  let q = query(
    collection(db, "users"),
    where("role", "==", "student"),
    orderBy("firstName"),
    limit(5)
  );
  if (startAfterDoc) {
    q = query(q, startAfter(startAfterDoc));
  }
  return (await getDocs(q)).docs;
}

studentSearchBtn.addEventListener("click", async () => {
  currentPage = 1;
  const docs = await fetchStudents(currentPage);
  renderStudents(docs);
  renderPaginationControls();
});
async function loadStudentSearch(newSearch = false) {
  const input = studentSearchInput.value.trim().toLowerCase();
  if (newSearch) {
    studentPages = [];
    currentPageIndex = 0;
    searchQuery = input;
    cachedStudentResults = [];
  }

  let startAfterDoc = studentPages[currentPageIndex - 1] || null;
  let pageDocs = await fetchStudentsPage(startAfterDoc);

  if (!studentPages[currentPageIndex]) {
    studentPages[currentPageIndex] = pageDocs[pageDocs.length - 1];
  }

  const filtered = pageDocs.filter(docSnap => {
    const s = docSnap.data();
    const fullName = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
    const email = (s.email || "").toLowerCase();
    return fullName.includes(searchQuery) || email.includes(searchQuery);
  });

  studentSearchResults.innerHTML = "";

assignSelectedBtn.addEventListener("click", async () => {
  if (!filtered.length) {
    studentSearchResults.innerHTML = "<tr><td colspan='4'>No matching students.</td></tr>";
  } else {
    filtered.forEach(docSnap => {
      const s = docSnap.data();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${s.firstName || "-"}</td>
        <td>${s.lastName || "-"}</td>
        <td>${s.email || "-"}</td>
        <td><input type="checkbox" value="${docSnap.id}" /></td>
      `;
      studentSearchResults.appendChild(row);
    });
  }

  paginationInfo.textContent = `Page ${currentPageIndex + 1}`;
  nextPageBtn.style.display = "inline-block";
  prevPageBtn.style.display = currentPageIndex > 0 ? "inline-block" : "none";
}

assignSelectedBtn?.addEventListener("click", async () => {
  const selected = studentSearchResults.querySelectorAll('input[type="checkbox"]:checked');
  if (!selected.length) return alert("No students selected.");

  await Promise.all(
    Array.from(selected).map(cb =>
      updateDoc(doc(db, "users", cb.value), { parentId: currentUserId })
    )
  );
  await Promise.all(Array.from(selected).map(cb =>
    updateDoc(doc(db, "users", cb.value), { parentId: currentUserId })
  ));
  alert("Students assigned.");
  studentSearchBtn.click();
  loadAssignedStudents(currentUserId);
  loadStudentSearch(true);
});

studentSearchBtn?.addEventListener("click", () => loadStudentSearch(true));
nextPageBtn?.addEventListener("click", () => {
  currentPageIndex++;
  loadStudentSearch();
});
prevPageBtn?.addEventListener("click", () => {
  if (currentPageIndex > 0) {
    currentPageIndex--;
    loadStudentSearch();
  }
});

onAuthStateChanged(auth, user => {
onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "index.html";
  else loadUserProfile();
});
