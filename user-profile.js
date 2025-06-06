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

// DOM Elements
const userInfoContainer = document.getElementById("userInfo");
const transactionTable = document.querySelector("#transactionTable tbody");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const editFields = document.getElementById("editFields");
const vendorSection = document.getElementById("vendorInfoSection");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");

const editFirstName = document.getElementById("editFirstName");
const editLastName = document.getElementById("editLastName");
const editRole = document.getElementById("editRole");

const vendorName = document.getElementById("vendorName");
const vendorCategory = document.getElementById("vendorCategory");
const vendorLocation = document.getElementById("vendorLocation");
const vendorNameInput = document.getElementById("vendorNameInput");
const vendorCategoryInput = document.getElementById("vendorCategoryInput");
const vendorLocationInput = document.getElementById("vendorLocationInput");

const adminControls = document.getElementById("adminControls");

const addStudentSection = document.getElementById("addStudentSection");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentResultsTable = document.getElementById("studentResultsTable");
const assignSelectedBtn = document.getElementById("assignSelectedBtn");

let currentUser = null;

// Load user profile
async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    alert("User not found");
    return;
  }

  const user = userDoc.data();
  currentUser = user;

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
    addStudentSection.style.display = "block";
    loadStudentResults(""); // Load all by default
  }

  // Load transactions
  const txSnap = await getDocs(query(collection(db, "transactions"), where("to", "==", uid)));
  transactionTable.innerHTML = "";
  for (const docSnap of txSnap.docs) {
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

// Edit
editBtn.addEventListener("click", () => {
  editFields.style.display = "block";
  userInfoContainer.style.display = "none";
  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
  document.querySelectorAll(".edit-field").forEach(el => el.style.display = "block");
  document.querySelectorAll(".value").forEach(el => el.style.display = "none");
});

// Save
saveBtn.addEventListener("click", async () => {
  try {
    await updateDoc(doc(db, "users", uid), {
      firstName: editFirstName.value.trim(),
      lastName: editLastName.value.trim(),
      role: editRole.value
    });

    if (editRole.value === "vendor") {
      await setDoc(doc(db, "vendors", uid), {
        name: vendorNameInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        location: vendorLocationInput.value.trim()
      }, { merge: true });
    }

    alert("✅ Profile updated!");
    window.location.reload();
  } catch (error) {
    console.error(error);
    alert("❌ Failed to update profile.");
  }
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Load available students
async function loadStudentResults(searchTerm) {
  let q = query(collection(db, "users"), where("role", "==", "cardholder"));
  const snapshot = await getDocs(q);

  studentResultsTable.innerHTML = "";
  let count = 0;
  snapshot.forEach(docSnap => {
    const student = docSnap.data();
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    if (!searchTerm || fullName.includes(searchTerm.toLowerCase())) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${student.firstName}</td>
        <td>${student.lastName}</td>
        <td>${student.email}</td>
        <td><input type="checkbox" data-uid="${docSnap.id}" /></td>
      `;
      studentResultsTable.appendChild(row);
      count++;
    }
  });

  if (count === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4">No matching students found.</td>`;
    studentResultsTable.appendChild(row);
  }
}

// Search students
studentSearchBtn.addEventListener("click", () => {
  const searchTerm = studentSearchInput.value.trim();
  loadStudentResults(searchTerm);
});

// Assign students
assignSelectedBtn.addEventListener("click", async () => {
  const selected = [...studentResultsTable.querySelectorAll('input[type="checkbox"]:checked')];
  if (selected.length === 0) {
    alert("Please select at least one student.");
    return;
  }

  for (const checkbox of selected) {
    const studentId = checkbox.getAttribute("data-uid");
    await updateDoc(doc(db, "users", studentId), {
      parentId: uid
    });
  }

  alert("✅ Students assigned.");
  loadStudentResults(""); // refresh
});

// Auth
onAuthStateChanged(auth, user => {
  if (user) {
    loadUserProfile(uid);
  } else {
    window.location.href = "index.html";
  }
});
