import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
  collection,
  query,
  where,
  setDoc,
  limit,
  startAfter,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase setup
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MSG_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

// DOM elements
const addStudentBtn = document.getElementById("addStudentBtn");
const assignForm = document.getElementById("assignStudentForm");
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const studentResultsTbody = document.getElementById("studentSearchResults");
const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");
const assignedStudentsList = document.getElementById("assignedStudentsList");

let studentDocs = [];
let currentPage = 0;
const pageSize = 5;

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userDoc = await getDoc(doc(db, "users", uid));
  const userData = userDoc.data();
  if (userData.role === "parent") {
    addStudentBtn.style.display = "inline-block";
    await loadAssignedStudents();
  }
});

addStudentBtn.addEventListener("click", async () => {
  assignForm.style.display = "block";
  currentPage = 0;
  await loadStudentPage();
});

studentSearchBtn.addEventListener("click", () => {
  currentPage = 0;
  loadStudentPage(studentSearchInput.value.trim().toLowerCase());
});

async function loadStudentPage(search = "") {
  const usersCol = collection(db, "users");
  const q = query(usersCol, where("role", "==", "student"));

  const snapshot = await getDocs(q);
  studentDocs = snapshot.docs.filter(docSnap => {
    const data = docSnap.data();
    const fullText = `${data.firstName} ${data.lastName} ${data.email}`.toLowerCase();
    return fullText.includes(search);
  });

  renderPage();
}

function renderPage() {
  const start = currentPage * pageSize;
  const end = start + pageSize;
  const pageDocs = studentDocs.slice(start, end);

  studentResultsTbody.innerHTML = "";
  for (const docSnap of pageDocs) {
    const student = docSnap.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${student.firstName || "-"}</td>
      <td>${student.lastName || "-"}</td>
      <td>${student.email || "-"}</td>
      <td><input type="checkbox" data-uid="${docSnap.id}"></td>
    `;
    studentResultsTbody.appendChild(row);
  }

  renderPaginationControls();
}

function renderPaginationControls() {
  let controls = document.getElementById("paginationControls");
  if (!controls) {
    controls = document.createElement("div");
    controls.id = "paginationControls";
    controls.style.marginTop = "10px";
    assignForm.appendChild(controls);
  }

  controls.innerHTML = `
    <button ${currentPage === 0 ? "disabled" : ""} id="prevBtn">Prev</button>
    <span style="margin: 0 10px;">Page ${currentPage + 1} of ${Math.ceil(studentDocs.length / pageSize)}</span>
    <button ${(currentPage + 1) * pageSize >= studentDocs.length ? "disabled" : ""} id="nextBtn">Next</button>
  `;

  document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      renderPage();
    }
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    if ((currentPage + 1) * pageSize < studentDocs.length) {
      currentPage++;
      renderPage();
    }
  });
}

assignSelectedStudentsBtn.addEventListener("click", async () => {
  const checkboxes = studentResultsTbody.querySelectorAll("input[type='checkbox']:checked");
  const selectedUIDs = Array.from(checkboxes).map(cb => cb.getAttribute("data-uid"));

  const parentRef = doc(db, "users", uid);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) return;

  const current = parentSnap.data().children || [];
  const updated = Array.from(new Set([...current, ...selectedUIDs]));

  await updateDoc(parentRef, { children: updated });
  alert("Students assigned.");
  await loadAssignedStudents();
});

async function loadAssignedStudents() {
  assignedStudentsList.innerHTML = "";

  const parentSnap = await getDoc(doc(db, "users", uid));
  const children = parentSnap.data().children || [];

  for (const studentId of children) {
    const studentSnap = await getDoc(doc(db, "users", studentId));
    if (studentSnap.exists()) {
      const student = studentSnap.data();
      const div = document.createElement("div");
      div.innerHTML = `
        <div>
          <span class="label">Student</span>
          <span class="value">${student.firstName} ${student.lastName} (${student.email})</span>
        </div>
      `;
      assignedStudentsList.appendChild(div);
    }
  }
}

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
