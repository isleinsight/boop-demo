import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getFirestore, collection, query, orderBy, limit, getDocs, startAfter,
  endBefore, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const usersRef = collection(db, "users");
let lastVisible = null;
let firstVisible = null;
let currentPage = 1;
const pageSize = 20;
let currentDocs = [];

const usersTableBody = document.getElementById("usersTableBody");
const pageNumber = document.getElementById("pageNumber");

async function fetchUsers(direction = "next") {
  let q;

  if (direction === "next" && lastVisible) {
    q = query(usersRef, orderBy("firstName"), startAfter(lastVisible), limit(pageSize));
  } else if (direction === "prev" && firstVisible) {
    q = query(usersRef, orderBy("firstName"), endBefore(firstVisible), limit(pageSize));
  } else {
    q = query(usersRef, orderBy("firstName"), limit(pageSize));
  }

  const snapshot = await getDocs(q);
  currentDocs = snapshot.docs;

  if (snapshot.empty) {
    console.log("No users found.");
    return;
  }

  firstVisible = snapshot.docs[0];
  lastVisible = snapshot.docs[snapshot.docs.length - 1];

  usersTableBody.innerHTML = "";
  snapshot.forEach(docSnap => {
    const user = docSnap.data();
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${user.firstName || ""}</td>
      <td>${user.lastName || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>${user.addedBy || ""}</td>
      <td><button onclick="deleteUser('${docSnap.id}')">Delete</button></td>
    `;

    usersTableBody.appendChild(row);
  });

  pageNumber.textContent = `Page ${currentPage}`;
}

window.deleteUser = async function (userId) {
  if (confirm("Are you sure you want to delete this user?")) {
    try {
      await deleteDoc(doc(db, "users", userId));
      alert("User deleted successfully.");
      fetchUsers(); // Refresh user list
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  }
};

document.getElementById("nextPageBtn").addEventListener("click", () => {
  currentPage++;
  fetchUsers("next");
});

document.getElementById("prevPageBtn").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    fetchUsers("prev");
  }
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const rows = usersTableBody.querySelectorAll("tr");
  rows.forEach(row => {
    const rowText = row.textContent.toLowerCase();
    row.style.display = rowText.includes(searchTerm) ? "" : "none";
  });
});

fetchUsers();
