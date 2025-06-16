import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
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

const uid = new URLSearchParams(window.location.search).get("uid");
if (!uid) {
  alert("User ID not found.");
  window.location.href = "view-users.html";
}

let currentUserData = null;

// DOM elements
const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const studentSection = document.getElementById("studentSection");
const assignedStudentsList = document.getElementById("assignedStudentsList");
const parentSection = document.getElementById("parentSection");
const parentName = document.getElementById("parentName");
const parentEmail = document.getElementById("parentEmail");
const addStudentBtn = document.getElementById("addStudentBtn");
const assignStudentForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "index.html";

  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return alert("User not found.");

  const data = userDoc.data();
  currentUserData = data;

  // Display user details
  userInfo.innerHTML = `
    <div>
      <span class="label">First Name</span>
      <span class="value">${data.firstName || "-"}</span>
    </div>
    <div>
      <span class="label">Last Name</span>
      <span class="value">${data.lastName || "-"}</span>
    </div>
    <div>
      <span class="label">Email</span>
      <span class="value">${data.email || "-"}</span>
    </div>
    <div>
      <span class="label">Role</span>
      <span class="value">${data.role || "-"}</span>
    </div>
    <div>
      <span class="label">Status</span>
      <span class="value" style="color:${data.status === "suspended" ? "#e74c3c" : "#27ae60"};">
        ${data.status === "suspended" ? "Suspended" : "Active"}
      </span>
    </div>
  `;

  // Show parent if role is student
  if (data.role === "student" && data.parent) {
    parentSection.style.display = "block";
    const parentDoc = await getDoc(doc(db, "users", data.parent));
    if (parentDoc.exists()) {
      const p = parentDoc.data();
      parentName.innerHTML = `<a href="user-profile.html?uid=${data.parent}">${p.firstName} ${p.lastName}</a>`;
      parentEmail.textContent = p.email || "-";
    }
  }

  // Show students if role is parent
  if (data.role === "parent") {
    studentSection.style.display = "block";
    if (data.assignedStudents?.length) {
      for (const sid of data.assignedStudents) {
        const sDoc = await getDoc(doc(db, "users", sid));
        if (sDoc.exists()) {
          const s = sDoc.data();
          const el = document.createElement("div");
          el.innerHTML = \`
            <span class="label">Student</span>
            <a class="value" href="user-profile.html?uid=\${sid}">\${s.firstName} \${s.lastName}</a>
          \`;
          assignedStudentsList.appendChild(el);
        }
      }
    }
  }
});

// Add student form toggle
addStudentBtn.addEventListener("click", () => {
  assignStudentForm.style.display = assignStudentForm.style.display === "none" ? "block" : "none";
});

// Search for students
studentSearchBtn.addEventListener("click", async () => {
  const input = studentSearchInput.value.trim().toLowerCase();
  if (!input) return;

  const q = query(collection(db, "users"), where("role", "==", "student"));
  const snap = await getDocs(q);
  const results = [];
  snap.forEach(doc => {
    const data = doc.data();
    const match = (data.firstName + data.lastName + data.email).toLowerCase().includes(input);
    if (match) results.push({ id: doc.id, ...data });
  });

  studentSearchResults.innerHTML = "";
  results.slice(0, 5).forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = \`
      <td>\${s.firstName}</td>
      <td>\${s.lastName}</td>
      <td>\${s.email}</td>
      <td><input type="checkbox" data-id="\${s.id}"></td>
    \`;
    studentSearchResults.appendChild(tr);
  });
});

// Save assigned students
assignSelectedStudentsBtn.addEventListener("click", async () => {
  const checkboxes = studentSearchResults.querySelectorAll("input[type='checkbox']:checked");
  const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);

  if (!selectedIds.length) return alert("Select at least one student.");

  // Update parent doc
  await updateDoc(doc(db, "users", uid), {
    assignedStudents: selectedIds
  });

  // Update each student with parent ID
  for (const sid of selectedIds) {
    await updateDoc(doc(db, "users", sid), { parent: uid });
  }

  alert("Students assigned.");
  location.reload();
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});
