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

// Initialize Firebase
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

// State
let selectedParentId = null;
let parentData = [];
let studentData = [];
let parentPage = 0;
let studentPage = 0;
const PAGE_SIZE = 5;

// DOM
const parentTableBody = document.getElementById("parentTableBody");
const studentTableBody = document.getElementById("studentTableBody");

// Helpers
function renderTable(data, tableBody, page, role, selectType) {
  tableBody.innerHTML = "";
  const start = page * PAGE_SIZE;
  const current = data.slice(start, start + PAGE_SIZE);

  current.forEach(user => {
    const tr = document.createElement("tr");

    if (role === "parent" && user.id === selectedParentId) {
      tr.classList.add("selected-row");
    }

    const selectCell = (selectType === "checkbox")
      ? `<input type="checkbox" value="${user.id}" />`
      : `<button data-id="${user.id}" class="select-parent-btn">Select</button>`;

    tr.innerHTML = `
      <td>${user.firstName}</td>
      <td>${user.lastName}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${selectCell}</td>
    `;

    tableBody.appendChild(tr);
  });

  if (role === "parent") {
    document.querySelectorAll(".select-parent-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        selectedParentId = e.target.getAttribute("data-id");
        renderParents();
      });
    });
  }
}

async function fetchData(role, searchTerm) {
  const q = query(collection(db, "users"), where("role", "==", role));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(user => {
      const fullText = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
      return fullText.includes(searchTerm.toLowerCase());
    });
}

// Render + Pagination
function renderParents() {
  renderTable(parentData, parentTableBody, parentPage, "parent", "button");
  document.getElementById("parentPaginationInfo").textContent = `Page ${parentPage + 1}`;
}

function renderStudents() {
  renderTable(studentData, studentTableBody, studentPage, "student", "checkbox");
  document.getElementById("studentPaginationInfo").textContent = `Page ${studentPage + 1}`;
}

// Pagination handlers
document.getElementById("prevParentBtn").onclick = () => {
  if (parentPage > 0) {
    parentPage--;
    renderParents();
  }
};
document.getElementById("nextParentBtn").onclick = () => {
  if ((parentPage + 1) * PAGE_SIZE < parentData.length) {
    parentPage++;
    renderParents();
  }
};
document.getElementById("prevStudentBtn").onclick = () => {
  if (studentPage > 0) {
    studentPage--;
    renderStudents();
  }
};
document.getElementById("nextStudentBtn").onclick = () => {
  if ((studentPage + 1) * PAGE_SIZE < studentData.length) {
    studentPage++;
    renderStudents();
  }
};

// Search handlers
document.getElementById("parentSearchBtn").onclick = async () => {
  const term = document.getElementById("parentSearch").value;
  parentData = await fetchData("parent", term);
  parentPage = 0;
  renderParents();
};

document.getElementById("studentSearchBtn").onclick = async () => {
  const term = document.getElementById("studentSearch").value;
  studentData = await fetchData("student", term);
  studentPage = 0;
  renderStudents();
};

// Assign selected students to parent
document.getElementById("assignButton").onclick = async () => {
  const status = document.getElementById("statusMessage");

  if (!selectedParentId) {
    status.textContent = "Please select a parent.";
    status.style.color = "red";
    return;
  }

  const selectedCheckboxes = studentTableBody.querySelectorAll("input[type='checkbox']:checked");
  const studentIds = Array.from(selectedCheckboxes).map(cb => cb.value);

  if (studentIds.length === 0) {
    status.textContent = "Please select at least one student.";
    status.style.color = "red";
    return;
  }

  try {
    await updateDoc(doc(db, "users", selectedParentId), {
      children: studentIds
    });
    status.textContent = "Students successfully assigned!";
    status.style.color = "green";
  } catch (err) {
    console.error("Error assigning students:", err);
    status.textContent = "An error occurred.";
    status.style.color = "red";
  }
};

// Load initial data on page load
(async () => {
  parentData = await fetchData("parent", "");
  studentData = await fetchData("student", "");
  renderParents();
  renderStudents();
})();
