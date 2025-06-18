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
  getDocs,
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

// DOM refs
const studentSearchInput = document.getElementById("studentSearchInput");
const studentSearchResults = document.getElementById("studentSearchResults");
const assignSelectedBtn = document.getElementById("assignSelectedStudentsBtn");
const paginationContainer = document.getElementById("paginationContainer");
const studentSearchBtn = document.getElementById("studentSearchBtn");

let currentUserId = new URLSearchParams(window.location.search).get("uid");
let currentPage = 1;
let studentsPerPage = 5;
let lastVisibleDoc = null;
let pageMap = [];

async function fetchStudents(page = 1) {
  let q = query(
    collection(db, "users"),
    where("role", "==", "student"),
    orderBy("firstName"),
    limit(studentsPerPage)
  );

  if (pageMap[page - 2]) {
    q = query(q, startAfter(pageMap[page - 2]));
  }

  const snapshot = await getDocs(q);
  if (snapshot.empty) return [];

  pageMap[page - 1] = snapshot.docs[snapshot.docs.length - 1];
  return snapshot.docs;
}

function renderStudents(docs) {
  studentSearchResults.innerHTML = "";
  if (!docs.length) {
    studentSearchResults.innerHTML = "<tr><td colspan='4'>No students found.</td></tr>";
    return;
  }

  docs.forEach(docSnap => {
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

function renderPaginationControls() {
  paginationContainer.innerHTML = "";

  for (let i = 1; i <= pageMap.length + 1; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.classList.add("page-btn");
    if (i === currentPage) btn.classList.add("active");

    btn.addEventListener("click", async () => {
      currentPage = i;
      const docs = await fetchStudents(i);
      renderStudents(docs);
      renderPaginationControls();
    });

    paginationContainer.appendChild(btn);
  }
}

studentSearchBtn.addEventListener("click", async () => {
  currentPage = 1;
  const docs = await fetchStudents(currentPage);
  renderStudents(docs);
  renderPaginationControls();
});

assignSelectedBtn.addEventListener("click", async () => {
  const selected = studentSearchResults.querySelectorAll('input[type="checkbox"]:checked');
  if (!selected.length) return alert("No students selected.");

  await Promise.all(
    Array.from(selected).map(cb =>
      updateDoc(doc(db, "users", cb.value), { parentId: currentUserId })
    )
  );
  alert("Students assigned.");
  studentSearchBtn.click();
});

onAuthStateChanged(auth, user => {
  if (!user) window.location.href = "index.html";
});
