import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM elements
const parentSearchBtn = document.getElementById("parentSearchBtn");
const studentSearchBtn = document.getElementById("studentSearchBtn");
const assignButton = document.getElementById("assignButton");

const parentResults = document.getElementById("parentResults");
const studentResults = document.getElementById("studentResults");
const statusMessage = document.getElementById("statusMessage");

let selectedParentId = null;

const PAGE_SIZE = 5;
let parentData = [];
let studentData = [];
let parentPage = 0;
let studentPage = 0;

// Render parents
function renderParents() {
  parentResults.innerHTML = "";
  const start = parentPage * PAGE_SIZE;
  const currentPage = parentData.slice(start, start + PAGE_SIZE);

  if (currentPage.length === 0) {
    parentResults.innerHTML = "<em>No matching parents found.</em>";
    return;
  }

  currentPage.forEach((user) => {
    const div = document.createElement("div");
    div.style.marginBottom = "10px";

    const btn = document.createElement("button");
    btn.textContent = `Select ${user.firstName} ${user.lastName} (${user.email})`;
    btn.addEventListener("click", () => {
      selectedParentId = user.id;
      statusMessage.textContent = `Selected parent: ${user.firstName} ${user.lastName}`;
      statusMessage.style.color = "#333";
    });

    div.appendChild(btn);
    parentResults.appendChild(div);
  });

  const nav = document.createElement("div");
  nav.innerHTML = `
    <div class="pagination">
      <button ${parentPage === 0 ? "disabled" : ""} id="prevParent">Previous</button>
      <button ${start + PAGE_SIZE >= parentData.length ? "disabled" : ""} id="nextParent">Next</button>
    </div>
  `;
  parentResults.appendChild(nav);

  document.getElementById("prevParent")?.addEventListener("click", () => {
    parentPage--;
    renderParents();
  });

  document.getElementById("nextParent")?.addEventListener("click", () => {
    parentPage++;
    renderParents();
  });
}

// Render students
function renderStudents() {
  studentResults.innerHTML = "";
  const start = studentPage * PAGE_SIZE;
  const currentPage = studentData.slice(start, start + PAGE_SIZE);

  if (currentPage.length === 0) {
    studentResults.innerHTML = "<em>No matching students found.</em>";
    return;
  }

  currentPage.forEach((user) => {
    const label = document.createElement("label");
    label.classList.add("student-checkbox");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = user.id;

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${user.firstName} ${user.lastName} (${user.email})`));
    studentResults.appendChild(label);
  });

  const nav = document.createElement("div");
  nav.innerHTML = `
    <div class="pagination">
      <button ${studentPage === 0 ? "disabled" : ""} id="prevStudent">Previous</button>
      <button ${start + PAGE_SIZE >= studentData.length ? "disabled" : ""} id="nextStudent">Next</button>
    </div>
  `;
  studentResults.appendChild(nav);

  document.getElementById("prevStudent")?.addEventListener("click", () => {
    studentPage--;
    renderStudents();
  });

  document.getElementById("nextStudent")?.addEventListener("click", () => {
    studentPage++;
    renderStudents();
  });
}

// Search parents
parentSearchBtn.addEventListener("click", async () => {
  const searchTerm = document.getElementById("parentSearch").value.trim().toLowerCase();
  selectedParentId = null;
  parentPage = 0;
  parentData = [];

  const q = query(collection(db, "users"), where("role", "==", "parent"));
  const querySnapshot = await getDocs(q);

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const match = `${data.firstName} ${data.lastName} ${data.email}`.toLowerCase();
    if (match.includes(searchTerm)) {
      parentData.push({ id: docSnap.id, ...data });
    }
  });

  renderParents();
});

// Search students
studentSearchBtn.addEventListener("click", async () => {
  const searchTerm = document.getElementById("studentSearch").value.trim().toLowerCase();
  studentPage = 0;
  studentData = [];

  const q = query(collection(db, "users"), where("role", "==", "student"));
  const querySnapshot = await getDocs(q);

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const match = `${data.firstName} ${data.lastName} ${data.email}`.toLowerCase();
    if (match.includes(searchTerm)) {
      studentData.push({ id: docSnap.id, ...data });
    }
  });

  renderStudents();
});

// Assign students to parent
assignButton.addEventListener("click", async () => {
  if (!selectedParentId) {
    statusMessage.textContent = "Please select a parent first.";
    statusMessage.style.color = "red";
    return;
  }

  const selectedStudentIds = Array.from(studentResults.querySelectorAll("input[type=checkbox]:checked"))
    .map(cb => cb.value);

  if (selectedStudentIds.length === 0) {
    statusMessage.textContent = "Please select at least one student.";
    statusMessage.style.color = "red";
    return;
  }

  try {
    const parentRef = doc(db, "users", selectedParentId);
    await updateDoc(parentRef, {
      children: selectedStudentIds
    });

    statusMessage.textContent = "Students successfully assigned to parent!";
    statusMessage.style.color = "green";
  } catch (error) {
    console.error("Assignment error:", error);
    statusMessage.textContent = "An error occurred while assigning students.";
    statusMessage.style.color = "red";
  }
});
