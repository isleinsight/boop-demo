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

let currentUser = null;
let lastVisible = null;

// Auth
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadUserProfile(uid);
  } else {
    window.location.href = "index.html";
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

  if (user.role === "parent") {
    studentSection.style.display = "block";
    addStudentBtn.style.display = "inline-block";
    await renderAssignedStudents();
  }

  if (user.role === "student" && user.parentId) {
    const parentDoc = await getDoc(doc(db, "users", user.parentId));
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
}

// Edit mode
editBtn.addEventListener("click", () => {
  editFields.style.display = "block";
  userInfoContainer.style.display = "none";
  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
  document.querySelectorAll(".edit-field").forEach(el => el.style.display = "block");
  document.querySelectorAll(".value").forEach(el => el.style.display = "none");
});

saveBtn.addEventListener("click", async () => {
  const updated = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    role: editRole.value
  };

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
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Add Student
addStudentBtn.addEventListener("click", async () => {
  assignForm.style.display = assignForm.style.display === "none" ? "block" : "none";
  await fetchStudents();
});

studentSearchBtn.addEventListener("click", async () => {
  currentPage = 0;
  await fetchStudents();
});

async function fetchStudents() {
  const keyword = studentSearchInput.value.trim().toLowerCase();
  const q = query(collection(db, "users"), where("role", "==", "student"), orderBy("firstName"));
  const snap = await getDocs(q);

  studentDocs = snap.docs.filter(docSnap => {
    const s = docSnap.data();
    return (
      !keyword ||
      s.firstName?.toLowerCase().includes(keyword) ||
      s.lastName?.toLowerCase().includes(keyword) ||
      s.email?.toLowerCase().includes(keyword)
    );
  });

  renderStudentPage();
}

function renderStudentPage() {
  studentSearchResults.innerHTML = "";
  const start = currentPage * pageSize;
  const current = studentDocs.slice(start, start + pageSize);

  for (const docSnap of current) {
    const s = docSnap.data();
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
  });
}
