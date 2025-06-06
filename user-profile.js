import {
  getFirestore, doc, getDoc, collection, query, where, getDocs, updateDoc, onSnapshot, setDoc, addDoc, deleteDoc, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-lite.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { app } from "./firebaseConfig.js";

const db = getFirestore(app);
const auth = getAuth(app);
let currentUser = null;
let lastVisibleStudent = null;
let studentSearchTerm = "";
let studentPage = 0;
const studentsPerPage = 5;

// --- Auth Check ---
onAuthStateChanged(auth, async (user) => {
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

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

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

  if (currentUser.role === "cardholder" && currentUser.parentId) {
    const parentDoc = await getDoc(doc(db, "users", currentUser.parentId));
    if (parentDoc.exists()) {
      const parent = parentDoc.data();
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

// --- Student Assignment Form ---
document.getElementById("addStudentBtn").addEventListener("click", () => {
  document.getElementById("assignStudentForm").style.display = "block";
  loadStudentSearchResults();
});

document.getElementById("studentSearchBtn").addEventListener("click", () => {
  studentSearchTerm = document.getElementById("studentSearchInput").value.toLowerCase();
  studentPage = 0;
  lastVisibleStudent = null;
  loadStudentSearchResults();
});

async function loadStudentSearchResults() {
  let q = query(collection(db, "users"), where("role", "==", "cardholder"), limit(studentsPerPage));
  if (lastVisibleStudent) {
    q = query(collection(db, "users"), where("role", "==", "cardholder"), startAfter(lastVisibleStudent), limit(studentsPerPage));
  }

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
}

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

// --- Remove Student ---
window.removeStudent = async function (studentId) {
  const studentRef = doc(db, "users", studentId);
  await updateDoc(studentRef, { parentId: "" });
  loadAssignedStudents(currentUser.id);
};

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

function renderWallet(user) {
  document.getElementById("walletId").textContent = user.walletId || "-";
  document.getElementById("walletBalance").textContent = user.walletBalance ? `$${user.walletBalance.toFixed(2)}` : "$0.00";
}

function renderVendorInfo(user) {
  document.getElementById("vendorInfoSection").style.display = "block";
  document.getElementById("vendorName").textContent = user.vendorName || "-";
  document.getElementById("vendorCategory").textContent = user.vendorCategory || "-";
  document.getElementById("vendorLocation").textContent = user.vendorLocation || "-";
}

async function renderTransactions(userId) {
  const q = query(collection(db, "transactions"), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  const tbody = document.getElementById("transactionTable").querySelector("tbody");
  tbody.innerHTML = "";
  snapshot.forEach((doc) => {
    const tx = doc.data();
    const row = document.createElement("tr");
    row.innerHTML = `
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
