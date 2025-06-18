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
  getDocs
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

let editFirstName, editLastName, editEmail, editRole;
let currentUserId = new URLSearchParams(window.location.search).get("uid");
let currentUserData = null;

if (!currentUserId) {
  alert("User ID not found.");
  window.location.href = "view-users.html";
}

async function loadUserProfile() {
  const userRef = doc(db, "users", currentUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return alert("User not found.");
  const user = snap.data();
  currentUserData = user;

  userInfo.innerHTML = `
    <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.firstName || "-"}</span>
    <input type="text" id="editFirstName" value="${user.firstName || ""}" style="display:none;" /></div>

    <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.lastName || "-"}</span>
    <input type="text" id="editLastName" value="${user.lastName || ""}" style="display:none;" /></div>

    <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email || "-"}</span>
    <input type="email" id="editEmail" value="${user.email || ""}" style="display:none;" /></div>

    <div><span class="label">Status</span><span class="value" id="viewStatus" style="color:${user.status === 'suspended' ? 'red' : 'green'}">${user.status || "active"}</span></div>

    <div><span class="label">Role</span><span class="value" id="viewRole">${user.role || "-"}</span>
    <select id="editRole" style="display:none;">
      <option value="cardholder">Cardholder</option>
      <option value="parent">Parent</option>
      <option value="vendor">Vendor</option>
      <option value="admin">Admin</option>
      <option value="student">Student</option>
    </select></div>
  `;

  editFirstName = document.getElementById("editFirstName");
  editLastName = document.getElementById("editLastName");
  editEmail = document.getElementById("editEmail");
  editRole = document.getElementById("editRole");

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

async function loadAssignedStudents(parentId) {
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snap = await getDocs(q);
  assignedStudentsList.innerHTML = "";

  if (snap.empty) {
    assignedStudentsList.innerHTML = "<div>No assigned students found.</div>";
    return;
  }

  snap.forEach(docSnap => {
    const student = docSnap.data();
    const div = document.createElement("div");
    div.innerHTML = `
      <div>
        <span class="label">Name</span>
        <span class="value"><a href="user-profile.html?uid=${docSnap.id}">${student.firstName} ${student.lastName}</a></span>
      </div>
      <button class="student-remove-btn" data-id="${docSnap.id}">Remove</button>
    `;
    assignedStudentsList.appendChild(div);
  });

  document.querySelectorAll(".student-remove-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (confirm("Remove this student?")) {
        await updateDoc(doc(db, "users", id), { parentId: null });
        loadAssignedStudents(parentId);
      }
    });
  });
}

// Edit
editBtn?.addEventListener("click", () => {
  document.getElementById("viewFirstName").style.display = "none";
  document.getElementById("viewLastName").style.display = "none";
  document.getElementById("viewEmail").style.display = "none";
  document.getElementById("viewRole").style.display = "none";
  editFirstName.style.display = "block";
  editLastName.style.display = "block";
  editEmail.style.display = "block";
  editRole.style.display = "block";
  saveBtn.style.display = "inline-block";
});

saveBtn?.addEventListener("click", async () => {
  await updateDoc(doc(db, "users", currentUserId), {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    email: editEmail.value.trim(),
    role: editRole.value
  });
  alert("Profile updated.");
  location.reload();
});

// Auth + Load
logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

onAuthStateChanged(auth, user => {
  if (!user) window.location.href = "index.html";
  else loadUserProfile();
});

// Assign students
addStudentBtn?.addEventListener("click", () => {
  assignStudentForm.style.display = "block";
  assignStudentForm.scrollIntoView({ behavior: "smooth" });
  loadStudentSearch();
});

studentSearchBtn?.addEventListener("click", () => loadStudentSearch());

assignSelectedBtn?.addEventListener("click", async () => {
  const selected = studentSearchResults.querySelectorAll('input[type="checkbox"]:checked');
  if (!selected.length) return alert("No students selected.");
  await Promise.all(Array.from(selected).map(cb =>
    updateDoc(doc(db, "users", cb.value), { parentId: currentUserId })
  ));
  alert("Students assigned.");
  loadAssignedStudents(currentUserId);
  loadStudentSearch();
});

async function fetchAllStudents() {
  const q = query(
    collection(db, "users"),
    where("role", "==", "student"),
    orderBy("firstName")
  );
  const snap = await getDocs(q);
  console.log("🎓 Fetched students:", snap.size);
  return snap.docs;
}

async function loadStudentSearch() {
  const input = studentSearchInput.value.trim().toLowerCase();
  const allStudents = await fetchAllStudents();

  const filtered = allStudents.filter(docSnap => {
    const s = docSnap.data();
    const fullName = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
    const email = (s.email || "").toLowerCase();
    return fullName.includes(input) || email.includes(input);
  });

  studentSearchResults.innerHTML = "";

  if (!filtered.length) {
    studentSearchResults.innerHTML = "<tr><td colspan='4'>No students found.</td></tr>";
    return;
  }

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
