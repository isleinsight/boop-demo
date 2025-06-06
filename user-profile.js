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
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

const userInfoContainer = document.getElementById("userInfo");
const transactionTable = document.querySelector("#transactionTable tbody");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const editFields = document.getElementById("editFields");
const toggleAssignFormBtn = document.getElementById("toggleAssignFormBtn");
const assignStudentForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");
const assignedStudentsList = document.getElementById("assignedStudentsList");

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

const addStudentBtn = document.getElementById("addStudentBtn");
let currentUser = null;
let lastVisibleStudent = null;
let firstPage = true;

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
    addStudentBtn.style.display = "inline-block";
    toggleAssignFormBtn.style.display = "inline-block";
    loadAssignedStudents();
  }

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

toggleAssignFormBtn.addEventListener("click", () => {
  assignStudentForm.style.display = assignStudentForm.style.display === "none" ? "block" : "none";
  searchAndRenderStudents(); // default search on open
});

studentSearchBtn.addEventListener("click", () => {
  searchAndRenderStudents();
});

async function searchAndRenderStudents(search = "", startAfterDoc = null) {
  studentSearchResults.innerHTML = "";

  let q = query(collection(db, "users"), where("role", "==", "cardholder"), limit(5));
  if (search.trim()) {
    q = query(collection(db, "users"), where("firstName", ">=", search), limit(5));
  }
  if (startAfterDoc) {
    q = query(q, startAfter(startAfterDoc));
  }

  const snap = await getDocs(q);
  if (snap.empty) {
    studentSearchResults.innerHTML = "<tr><td colspan='4'>No results found</td></tr>";
    return;
  }

  lastVisibleStudent = snap.docs[snap.docs.length - 1];

  snap.forEach(docSnap => {
    const user = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.firstName || "-"}</td>
      <td>${user.lastName || "-"}</td>
      <td>${user.email || "-"}</td>
      <td><input type="checkbox" value="${docSnap.id}" /></td>
    `;
    studentSearchResults.appendChild(tr);
  });

  // Add simple pagination
  const navRow = document.createElement("tr");
  navRow.innerHTML = `
    <td colspan="4">
      <button id="nextPageBtn">Next</button>
    </td>
  `;
  studentSearchResults.appendChild(navRow);

  document.getElementById("nextPageBtn").addEventListener("click", () => {
    if (lastVisibleStudent) {
      searchAndRenderStudents(search, lastVisibleStudent);
    }
  });
}

assignSelectedStudentsBtn.addEventListener("click", async () => {
  const checkboxes = studentSearchResults.querySelectorAll("input[type='checkbox']:checked");
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);

  if (selectedIds.length === 0) return alert("Please select at least one student.");

  try {
    await updateDoc(doc(db, "users", uid), {
      children: selectedIds
    });
    alert("✅ Students assigned.");
    assignStudentForm.style.display = "none";
    loadAssignedStudents();
  } catch (err) {
    console.error("❌ Error assigning students:", err);
    alert("Error assigning students.");
  }
});

async function loadAssignedStudents() {
  assignedStudentsList.innerHTML = "";
  const userDoc = await getDoc(doc(db, "users", uid));
  const children = userDoc.data().children || [];

  if (children.length === 0) {
    assignedStudentsList.innerHTML = "<p>No students assigned.</p>";
    return;
  }

  for (let childId of children) {
    const childDoc = await getDoc(doc(db, "users", childId));
    if (childDoc.exists()) {
      const child = childDoc.data();
      const div = document.createElement("div");
      div.innerHTML = `
        <div>
          <span class="label">Name</span>
          <span class="value">${child.firstName || "-"} ${child.lastName || "-"}</span>
        </div>
        <div>
          <span class="label">Email</span>
          <span class="value">${child.email || "-"}</span>
        </div>
      `;
      assignedStudentsList.appendChild(div);
    }
  }
}

// Edit/save
editBtn.addEventListener("click", () => {
  editFields.style.display = "block";
  userInfoContainer.style.display = "none";
  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
});

saveBtn.addEventListener("click", async () => {
  const updated = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    role: editRole.value
  };

  try {
    await updateDoc(doc(db, "users", uid), updated);
    alert("✅ Profile updated!");
    window.location.reload();
  } catch (err) {
    console.error("❌ Update failed:", err);
    alert("Error saving changes.");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUserProfile(uid);
  } else {
    window.location.href = "index.html";
  }
});
