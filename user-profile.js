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

// DOM elements
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

const logoutBtn = document.getElementById("logoutBtn");
const userInfoContainer = document.getElementById("userInfo");
const transactionTable = document.querySelector("#transactionTable tbody");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const vendorSection = document.getElementById("vendorInfoSection");
const vendorName = document.getElementById("vendorName");
const vendorCategory = document.getElementById("vendorCategory");
const vendorLocation = document.getElementById("vendorLocation");
const vendorNameInput = document.getElementById("vendorNameInput");
const vendorCategoryInput = document.getElementById("vendorCategoryInput");
const vendorLocationInput = document.getElementById("vendorLocationInput");

const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const editFields = document.getElementById("editFields");
const editFirstName = document.getElementById("editFirstName");
const editLastName = document.getElementById("editLastName");
const editRole = document.getElementById("editRole");

const addStudentBtn = document.getElementById("addStudentBtn");
const assignForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");
const assignedStudentsList = document.getElementById("assignedStudentsList");
const studentSection = document.getElementById("studentSection");
const parentSection = document.getElementById("parentSection");
const parentName = document.getElementById("parentName");
const parentEmail = document.getElementById("parentEmail");

let currentUser = null;
let lastStudentDoc = null;
let selectedStudentIds = new Set();

// Auth
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadUserProfile(uid);
});

// Load user info
async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    alert("User not found");
    return;
  }

  const user = userDoc.data();
  currentUser = user;

  // Info Box
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
      parentSection.style.display = "block";
      parentName.textContent = `${parent.firstName || ""} ${parent.lastName || ""}`;
      parentEmail.innerHTML = `<a href="user-profile.html?uid=${parentDoc.id}">${parent.email || "-"}</a>`;
    }
  }

  await loadTransactions(uid);
}

// Load transactions
async function loadTransactions(uid) {
  const snap = await getDocs(query(collection(db, "transactions"), where("to", "==", uid)));
  transactionTable.innerHTML = "";
  for (const docSnap of snap.docs) {
    const tx = docSnap.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
      <td>$${(tx.amount || 0).toFixed(2)}</td>
      <td>${tx.from || "-"}</td>
      <td>${tx.to || "-"}</td>
      <td>${tx.category || "-"}</td>
      <td>${tx.transactionId || docSnap.id}</td>
      <td>${tx.status || "-"}</td>
    `;
    transactionTable.appendChild(row);
  }
}

// Edit / Save
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
    console.error(err);
    alert("❌ Error saving changes.");
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Add Student button
addStudentBtn.addEventListener("click", () => {
  assignForm.style.display = assignForm.style.display === "none" ? "block" : "none";
  studentSearchResults.innerHTML = "";
  selectedStudentIds.clear();
  lastStudentDoc = null;
  fetchStudents();
});

// Search
studentSearchBtn.addEventListener("click", () => {
  studentSearchResults.innerHTML = "";
  selectedStudentIds.clear();
  lastStudentDoc = null;
  fetchStudents();
});

// Fetch students
async function fetchStudents() {
  const keyword = studentSearchInput.value.trim().toLowerCase();
  let q = query(
    collection(db, "users"),
    where("role", "==", "student"),
    orderBy("firstName"),
    limit(5)
  );

  if (lastStudentDoc) q = query(q, startAfter(lastStudentDoc));
  const snap = await getDocs(q);
  if (snap.empty) return;

  lastStudentDoc = snap.docs[snap.docs.length - 1];
  snap.forEach(docSnap => {
    const s = docSnap.data();
    if (
      !keyword ||
      s.firstName?.toLowerCase().includes(keyword) ||
      s.lastName?.toLowerCase().includes(keyword) ||
      s.email?.toLowerCase().includes(keyword)
    ) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${s.firstName || ""}</td>
        <td>${s.lastName || ""}</td>
        <td>${s.email || ""}</td>
        <td><input type="checkbox" value="${docSnap.id}" /></td>
      `;
      studentSearchResults.appendChild(row);
    }
  });
}

// Assign selected
assignSelectedStudentsBtn.addEventListener("click", async () => {
  const boxes = studentSearchResults.querySelectorAll("input[type='checkbox']");
  const selected = Array.from(boxes).filter(cb => cb.checked).map(cb => cb.value);
  if (selected.length === 0) return alert("Please select at least one student.");

  try {
    for (const sid of selected) {
      await updateDoc(doc(db, "users", sid), {
        parentId: uid
      });
    }
    alert("✅ Students assigned.");
    assignForm.style.display = "none";
    await renderAssignedStudents();
  } catch (e) {
    console.error(e);
    alert("❌ Failed to assign students.");
  }
});

// Render assigned students
async function renderAssignedStudents() {
  const snap = await getDocs(query(collection(db, "users"), where("parentId", "==", uid)));
  assignedStudentsList.innerHTML = "";
  if (snap.empty) {
    assignedStudentsList.innerHTML = "<p>No students assigned yet.</p>";
    return;
  }

  snap.forEach(docSnap => {
    const s = docSnap.data();
    const div = document.createElement("div");
    div.innerHTML = `
      <span class="label">Student</span>
      <span class="value"><a href="user-profile.html?uid=${docSnap.id}">${s.firstName || ""} ${s.lastName || ""} (${s.email || ""})</a></span>
      <button data-id="${docSnap.id}" class="remove-student" style="margin-top:10px;">Remove</button>
    `;
    assignedStudentsList.appendChild(div);
  });

  document.querySelectorAll(".remove-student").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      try {
        await updateDoc(doc(db, "users", id), { parentId: null });
        alert("Student removed.");
        await renderAssignedStudents();
      } catch (e) {
        alert("Error removing student.");
      }
    });
  });
}
