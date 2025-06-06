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
  orderBy,
  limit,
  startAfter,
  startAt
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
  getFirestore, doc, getDoc, collection, query, where, getDocs, updateDoc, onSnapshot, setDoc, addDoc, deleteDoc, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-lite.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { app } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Get UID from URL
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

// DOM Elements
const userInfoContainer = document.getElementById("userInfo");
const transactionTable = document.querySelector("#transactionTable tbody");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const editFields = document.getElementById("editFields");
const editFirstName = document.getElementById("editFirstName");
const editLastName = document.getElementById("editLastName");
const editRole = document.getElementById("editRole");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const vendorSection = document.getElementById("vendorInfoSection");
const vendorName = document.getElementById("vendorName");
const vendorCategory = document.getElementById("vendorCategory");
const vendorLocation = document.getElementById("vendorLocation");
const vendorNameInput = document.getElementById("vendorNameInput");
const vendorCategoryInput = document.getElementById("vendorCategoryInput");
const vendorLocationInput = document.getElementById("vendorLocationInput");
const logoutBtn = document.getElementById("logoutBtn");

const addStudentBtn = document.getElementById("addStudentBtn");
const assignForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");
const assignedStudentsList = document.getElementById("assignedStudentsList");

const studentSection = document.getElementById("studentSection");

// Pagination controls
let currentPage = 0;
let pageSize = 5;
let studentDocs = [];
let filteredDocs = [];

const auth = getAuth(app);
let currentUser = null;
let lastVisible = null;
let lastVisibleStudent = null;
let studentSearchTerm = "";
let studentPage = 0;
const studentsPerPage = 5;

// Auth
// --- Auth Check ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadUserProfile(uid);
  } else {
  if (!user) {
    window.location.href = "index.html";
  } else {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("id");
    if (userId) {
      loadUserProfile(userId);
    }
  }
});

async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    alert("User not found");
    return;
  }

  const user = userDoc.data();
  currentUser = user;

  userInfoContainer.innerHTML = `
    <div><span class="label">Name</span><span class="value">${user.firstName || ""} ${user.lastName || ""}</span></div>
    <div><span class="label">Email</span><span class="value">${user.email || "-"}</span></div>
    <div><span class="label">Role</span><span class="value">${user.role || "-"}</span></div>
    <div><span class="label">Wallet Address</span><span class="value">${user.walletAddress || "-"}</span></div>
    <div><span class="label">Added By</span><span class="value">${user.addedBy || "-"}</span></div>
    <div><span class="label">Created At</span><span class="value">${user.createdAt?.toDate().toLocaleString() || "-"}</span></div>
  `;

  editFirstName.value = user.firstName || "";
  editLastName.value = user.lastName || "";
  editRole.value = user.role || "cardholder";
  walletIdEl.textContent = user.walletAddress || "-";
  walletBalanceEl.textContent = `$${(user.balance || 0).toFixed(2)}`;

  if (user.role === "vendor") {
    vendorSection.style.display = "block";
    const vendorDoc = await getDoc(doc(db, "vendors", uid));
    if (vendorDoc.exists()) {
      const vendor = vendorDoc.data();
      vendorName.textContent = vendor.name || "-";
      vendorCategory.textContent = vendor.category || "-";
      vendorLocation.textContent = vendor.location || "-";
      vendorNameInput.value = vendor.name || "";
      vendorCategoryInput.value = vendor.category || "";
      vendorLocationInput.value = vendor.location || "";
    }
  }
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

  if (user.role === "parent") {
    studentSection.style.display = "block";
    addStudentBtn.style.display = "inline-block";
    await renderAssignedStudents();
// --- Load User Profile ---
async function loadUserProfile(userId) {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return;
  currentUser = { id: userDoc.id, ...userDoc.data() };

  renderUserInfo(currentUser);
  renderWallet(currentUser);
  renderTransactions(userId);

  if (currentUser.role === "vendor") renderVendorInfo(currentUser);
  if (currentUser.role === "parent") {
    document.getElementById("studentSection").style.display = "block";
    document.getElementById("addStudentBtn").style.display = "inline-block";
    loadAssignedStudents(userId);
  } else {
    document.getElementById("studentSection").style.display = "none";
    document.getElementById("addStudentBtn").style.display = "none";
  }

  if (user.role === "student" && user.parentId) {
    const parentDoc = await getDoc(doc(db, "users", user.parentId));
  if (currentUser.role === "cardholder" && currentUser.parentId) {
    const parentDoc = await getDoc(doc(db, "users", currentUser.parentId));
    if (parentDoc.exists()) {
      const parent = parentDoc.data();
      const parentBox = document.createElement("div");
      parentBox.className = "user-details-grid";
      parentBox.innerHTML = `
        <div>
          <span class="label">Parent</span>
          <a class="value" href="user-profile.html?uid=${user.parentId}">
            ${parent.firstName || ""} ${parent.lastName || ""} - ${parent.email || ""}
          </a>
        </div>
      `;
      userInfoContainer.appendChild(parentBox);
      const section = document.createElement("div");
      section.innerHTML = `
        <div class="section-title">Parent</div>
        <div class="user-details-grid">
          <div>
            <span class="label">Name</span>
            <span class="value"><a href="user-profile.html?id=${parentDoc.id}">${parent.firstName} ${parent.lastName}</a></span>
          </div>
          <div>
            <span class="label">Email</span>
            <span class="value">${parent.email}</span>
          </div>
        </div>`;
      document.querySelector(".profile-container").insertBefore(section, document.querySelector(".section-title"));
    }
  }

  await loadTransactions(uid);
}

async function loadTransactions(uid) {
  const txSnap = await getDocs(query(collection(db, "transactions"), where("to", "==", uid)));
  transactionTable.innerHTML = "";
  for (const docSnap of txSnap.docs) {
    const tx = docSnap.data();
    let category = "-";
    if (tx.from) {
      const vendorDoc = await getDoc(doc(db, "vendors", tx.from));
      if (vendorDoc.exists()) {
        category = vendorDoc.data().category || "-";
      }
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
      <td>$${(tx.amount || 0).toFixed(2)}</td>
      <td>${tx.from || "-"}</td>
      <td>${tx.to || "-"}</td>
      <td>${category}</td>
      <td>${tx.transactionId || docSnap.id}</td>
      <td>${tx.status || "-"}</td>
    `;
    transactionTable.appendChild(row);
  }
// --- Load Assigned Students ---
async function loadAssignedStudents(parentId) {
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snapshot = await getDocs(q);
  const container = document.getElementById("assignedStudentsList");
  container.innerHTML = "";

  snapshot.forEach((doc) => {
    const s = doc.data();
    const div = document.createElement("div");
    div.innerHTML = `
      <span class="label">Name</span>
      <span class="value"><a href="user-profile.html?id=${doc.id}">${s.firstName} ${s.lastName}</a></span><br/>
      <span class="label">Email</span>
      <span class="value">${s.email}</span>
      <button class="btnEdit" onclick="removeStudent('${doc.id}')">Remove</button>`;
    container.appendChild(div);
  });
}

// Edit mode
editBtn.addEventListener("click", () => {
  editFields.style.display = "block";
  userInfoContainer.style.display = "none";
  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
  document.querySelectorAll(".edit-field").forEach(el => el.style.display = "block");
  document.querySelectorAll(".value").forEach(el => el.style.display = "none");
// --- Student Assignment Form ---
document.getElementById("addStudentBtn").addEventListener("click", () => {
  document.getElementById("assignStudentForm").style.display = "block";
  loadStudentSearchResults();
});

saveBtn.addEventListener("click", async () => {
  const updated = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    role: editRole.value
  };
document.getElementById("studentSearchBtn").addEventListener("click", () => {
  studentSearchTerm = document.getElementById("studentSearchInput").value.toLowerCase();
  studentPage = 0;
  lastVisibleStudent = null;
  loadStudentSearchResults();
});

  try {
    await updateDoc(doc(db, "users", uid), updated);
    if (editRole.value === "vendor") {
      await setDoc(doc(db, "vendors", uid), {
        name: vendorNameInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        location: vendorLocationInput.value.trim()
      }, { merge: true });
    }
    alert("✅ Profile updated!");
    window.location.reload();
  } catch (err) {
    console.error("❌ Update failed:", err);
    alert("Error saving changes.");
async function loadStudentSearchResults() {
  let q = query(collection(db, "users"), where("role", "==", "cardholder"), limit(studentsPerPage));
  if (lastVisibleStudent) {
    q = query(collection(db, "users"), where("role", "==", "cardholder"), startAfter(lastVisibleStudent), limit(studentsPerPage));
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  const snapshot = await getDocs(q);
  const results = document.getElementById("studentSearchResults");
  results.innerHTML = "";
  snapshot.forEach((doc) => {
    const user = doc.data();
    if (
      !studentSearchTerm ||
      user.firstName?.toLowerCase().includes(studentSearchTerm) ||
      user.lastName?.toLowerCase().includes(studentSearchTerm) ||
      user.email?.toLowerCase().includes(studentSearchTerm)
    ) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.firstName}</td>
        <td>${user.lastName}</td>
        <td>${user.email}</td>
        <td><input type="checkbox" value="${doc.id}" /></td>`;
      results.appendChild(row);
      lastVisibleStudent = doc;
    }
  });
});

// Add Student
addStudentBtn.addEventListener("click", async () => {
  assignForm.style.display = assignForm.style.display === "none" ? "block" : "none";
  await fetchStudents();
});
}

studentSearchBtn.addEventListener("click", async () => {
  currentPage = 0;
  await fetchStudents();
// --- Assign Selected Students ---
document.getElementById("assignSelectedStudentsBtn").addEventListener("click", async () => {
  const selected = document.querySelectorAll("#studentSearchResults input[type='checkbox']:checked");
  for (let checkbox of selected) {
    const userRef = doc(db, "users", checkbox.value);
    await updateDoc(userRef, { parentId: currentUser.id });
  }
  loadAssignedStudents(currentUser.id);
  document.getElementById("assignStudentForm").style.display = "none";
});

async function fetchStudents() {
  const keyword = studentSearchInput.value.trim().toLowerCase();
  const q = query(collection(db, "users"), where("role", "==", "student"), orderBy("firstName"));
  const snap = await getDocs(q);
// --- Remove Student ---
window.removeStudent = async function (studentId) {
  const studentRef = doc(db, "users", studentId);
  await updateDoc(studentRef, { parentId: "" });
  loadAssignedStudents(currentUser.id);
};

  studentDocs = snap.docs.filter(docSnap => {
    const s = docSnap.data();
    return (
      !keyword ||
      s.firstName?.toLowerCase().includes(keyword) ||
      s.lastName?.toLowerCase().includes(keyword) ||
      s.email?.toLowerCase().includes(keyword)
    );
  });
// --- Render Helpers ---
function renderUserInfo(user) {
  const container = document.getElementById("userInfo");
  container.innerHTML = `
    <div><span class="label">First Name</span><span class="value">${user.firstName}</span></div>
    <div><span class="label">Last Name</span><span class="value">${user.lastName}</span></div>
    <div><span class="label">Email</span><span class="value">${user.email}</span></div>
    <div><span class="label">Role</span><span class="value">${user.role}</span></div>
  `;
}

  renderStudentPage();
function renderWallet(user) {
  document.getElementById("walletId").textContent = user.walletId || "-";
  document.getElementById("walletBalance").textContent = user.walletBalance ? `$${user.walletBalance.toFixed(2)}` : "$0.00";
}

function renderStudentPage() {
  studentSearchResults.innerHTML = "";
  const start = currentPage * pageSize;
  const current = studentDocs.slice(start, start + pageSize);
function renderVendorInfo(user) {
  document.getElementById("vendorInfoSection").style.display = "block";
  document.getElementById("vendorName").textContent = user.vendorName || "-";
  document.getElementById("vendorCategory").textContent = user.vendorCategory || "-";
  document.getElementById("vendorLocation").textContent = user.vendorLocation || "-";
}

  for (const docSnap of current) {
    const s = docSnap.data();
async function renderTransactions(userId) {
  const q = query(collection(db, "transactions"), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  const tbody = document.getElementById("transactionTable").querySelector("tbody");
  tbody.innerHTML = "";
  snapshot.forEach((doc) => {
    const tx = doc.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.firstName || "-"}</td>
      <td>${s.lastName || "-"}</td>
      <td>${s.email || "-"}</td>
      <td><input type="checkbox" value="${docSnap.id}" /></td>
    `;
    studentSearchResults.appendChild(row);
  }

  const pagination = document.createElement("tr");
  pagination.innerHTML = `
    <td colspan="4" style="text-align: center;">
      <button ${currentPage === 0 ? "disabled" : ""} id="prevBtn">Previous</button>
      <button ${(currentPage + 1) * pageSize >= studentDocs.length ? "disabled" : ""} id="nextBtn">Next</button>
    </td>
  `;
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

// Assign students
assignSelectedStudentsBtn.addEventListener("click", async () => {
  const checkboxes = studentSearchResults.querySelectorAll("input[type='checkbox']");
  const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  if (selected.length === 0) {
    alert("Please select at least one student.");
    return;
  }

  try {
    for (const studentId of selected) {
      await updateDoc(doc(db, "users", studentId), { parentId: uid });
    }
    alert("✅ Students assigned.");
    assignForm.style.display = "none";
    await renderAssignedStudents();
  } catch (err) {
    console.error("Assignment error:", err);
    alert("Failed to assign students.");
  }
});

async function renderAssignedStudents() {
  const q = query(collection(db, "users"), where("parentId", "==", uid));
  const snap = await getDocs(q);
  assignedStudentsList.innerHTML = "";
  if (snap.empty) {
    assignedStudentsList.innerHTML = "<p>No students assigned yet.</p>";
    return;
  }

  snap.forEach(docSnap => {
    const student = docSnap.data();
    const box = document.createElement("div");
    box.innerHTML = `
      <span class="label">Student</span>
      <a class="value" href="user-profile.html?uid=${docSnap.id}">
        ${student.firstName || ""} ${student.lastName || ""} - ${student.email || ""}
      </a>
    `;
    assignedStudentsList.appendChild(box);
      <td>${tx.timestamp || "-"}</td>
      <td>${tx.amount}</td>
      <td>${tx.from}</td>
      <td>${tx.to}</td>
      <td>${tx.category}</td>
      <td>${doc.id}</td>
      <td>${tx.status || "Complete"}</td>`;
    tbody.appendChild(row);
  });
}
