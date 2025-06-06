import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, query, where, getDocs, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Get userId from URL
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get("id");

let currentUser = null;
let currentPage = 1;
const resultsPerPage = 5;
let allStudents = [];
let filteredStudents = [];

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadUserProfile();
    document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth).then(() => location.href = "index.html"));
  } else {
    location.href = "index.html";
  }
});

async function loadUserProfile() {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return;

  currentUser = { id: userDoc.id, ...userDoc.data() };
  displayUserInfo();
  if (currentUser.role === "parent") {
    document.getElementById("addStudentBtn").style.display = "inline-block";
    document.getElementById("studentSection").style.display = "block";
    loadAssignedStudents();
    document.getElementById("addStudentBtn").addEventListener("click", () => {
      document.getElementById("assignStudentForm").style.display = "block";
      loadStudents();
    });
    document.getElementById("studentSearchBtn").addEventListener("click", () => {
      const searchTerm = document.getElementById("studentSearchInput").value.trim().toLowerCase();
      filteredStudents = allStudents.filter(s =>
        s.firstName.toLowerCase().includes(searchTerm) ||
        s.lastName.toLowerCase().includes(searchTerm) ||
        s.email.toLowerCase().includes(searchTerm)
      );
      renderStudentResults(1);
    });
    document.getElementById("assignSelectedStudentsBtn").addEventListener("click", assignSelectedStudents);
  } else if (currentUser.role === "cardholder" && currentUser.parentId) {
    const parentDoc = await getDoc(doc(db, "users", currentUser.parentId));
    if (parentDoc.exists()) {
      const parent = parentDoc.data();
      document.getElementById("parentSection").style.display = "block";
      document.getElementById("parentName").innerHTML = `<a href="user-profile.html?id=${parentDoc.id}">${parent.firstName} ${parent.lastName}</a>`;
      document.getElementById("parentEmail").innerHTML = `<a href="mailto:${parent.email}">${parent.email}</a>`;
    }
  }
}

function displayUserInfo() {
  const userInfoDiv = document.getElementById("userInfo");
  userInfoDiv.innerHTML = `
    <div><span class="label">First Name</span><span class="value">${currentUser.firstName}</span></div>
    <div><span class="label">Last Name</span><span class="value">${currentUser.lastName}</span></div>
    <div><span class="label">Email</span><span class="value">${currentUser.email}</span></div>
    <div><span class="label">Role</span><span class="value">${currentUser.role}</span></div>
  `;
}

async function loadAssignedStudents() {
  const q = query(collection(db, "users"), where("parentId", "==", currentUser.id), where("role", "==", "cardholder"));
  const snapshot = await getDocs(q);
  const assignedList = document.getElementById("assignedStudentsList");
  assignedList.innerHTML = "";

  snapshot.forEach(docSnap => {
    const student = docSnap.data();
    assignedList.innerHTML += `
      <div>
        <span class="label">Name</span>
        <span class="value"><a href="user-profile.html?id=${docSnap.id}">${student.firstName} ${student.lastName}</a></span>
        <br>
        <span class="label">Email</span>
        <span class="value"><a href="mailto:${student.email}">${student.email}</a></span>
      </div>
    `;
  });
}

async function loadStudents() {
  const q = query(collection(db, "users"), where("role", "==", "cardholder"));
  const snapshot = await getDocs(q);
  allStudents = snapshot.docs
    .filter(doc => doc.data().parentId !== currentUser.id)
    .map(doc => ({ id: doc.id, ...doc.data() }));
  filteredStudents = [...allStudents];
  renderStudentResults(1);
}

function renderStudentResults(page) {
  currentPage = page;
  const start = (page - 1) * resultsPerPage;
  const end = start + resultsPerPage;
  const results = filteredStudents.slice(start, end);

  const tbody = document.getElementById("studentSearchResults");
  tbody.innerHTML = results.map(student => `
    <tr>
      <td>${student.firstName}</td>
      <td>${student.lastName}</td>
      <td>${student.email}</td>
      <td><input type="checkbox" value="${student.id}" /></td>
    </tr>
  `).join("");

  renderPagination();
}

function renderPagination() {
  let paginationDiv = document.getElementById("paginationControls");
  if (!paginationDiv) {
    paginationDiv = document.createElement("div");
    paginationDiv.id = "paginationControls";
    paginationDiv.style.marginTop = "10px";
    document.getElementById("assignStudentForm").appendChild(paginationDiv);
  }

  const totalPages = Math.ceil(filteredStudents.length / resultsPerPage);
  paginationDiv.innerHTML = `
    <button ${currentPage === 1 ? "disabled" : ""} onclick="window.goToStudentPage(${currentPage - 1})">Previous</button>
    <span> Page ${currentPage} of ${totalPages} </span>
    <button ${currentPage === totalPages ? "disabled" : ""} onclick="window.goToStudentPage(${currentPage + 1})">Next</button>
  `;
}

window.goToStudentPage = function (page) {
  renderStudentResults(page);
};

async function assignSelectedStudents() {
  const checkboxes = document.querySelectorAll("#studentSearchResults input[type=checkbox]:checked");
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);

  for (let studentId of selectedIds) {
    const studentRef = doc(db, "users", studentId);
    await updateDoc(studentRef, { parentId: currentUser.id });
  }

  await loadAssignedStudents();
  alert("Students assigned!");
}
