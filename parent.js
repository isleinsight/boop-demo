// Firebase v10 imports
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
  collection,
  query,
  where,
  orderBy,
  limit,
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
const db = getFirestore(app);
const auth = getAuth(app);

// DOM
const studentsList = document.getElementById("studentsList");
const logoutBtn = document.getElementById("logoutBtn");

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadStudents(user.uid);
  } else {
    window.location.href = "index.html";
  }
});

// Load students assigned to the logged-in parent
async function loadStudents(parentId) {
  if (!studentsList) return console.error("Missing studentsList element");

  studentsList.innerHTML = "";

  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    studentsList.innerHTML = `<p>No students assigned to you.</p>`;
    return;
  }

  snapshot.forEach(async (docSnap) => {
    const student = docSnap.data();
    const studentId = docSnap.id;

    const studentBox = document.createElement("div");
    studentBox.className = "user-details-grid";
    studentBox.style.marginBottom = "30px";

    studentBox.innerHTML = `
      <div>
        <span class="label">Name</span>
        <span class="value">${student.firstName || ""} ${student.lastName || ""}</span>
      </div>
      <div>
        <span class="label">Email</span>
        <span class="value">${student.email || ""}</span>
      </div>
      <div>
        <span class="label">Wallet ID</span>
        <span class="value">${student.walletId || "N/A"}</span>
      </div>
      <div>
        <span class="label">Balance</span>
        <span class="value">$${student.walletBalance?.toFixed(2) || "0.00"}</span>
      </div>
      <div style="grid-column: 1 / -1; text-align: right;">
        <button onclick="handleAddFunds('${studentId}')" class="add-funds-btn">Add Funds</button>
      </div>
      <div style="grid-column: 1 / -1;">
        <span class="label">Recent Transactions</span>
        <table class="transaction-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Amount</th>
              <th>To</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="tx-${studentId}">
            <tr><td colspan="5">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    studentsList.appendChild(studentBox);

    // Load transactions for this student
    loadTransactions(studentId);
  });
}

async function loadTransactions(studentId) {
  const txTable = document.getElementById(`tx-${studentId}`);
  if (!txTable) return;

  txTable.innerHTML = "";

  const q = query(
    collection(db, "transactions"),
    where("from", "==", studentId),
    orderBy("timestamp", "desc"),
    limit(5)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    txTable.innerHTML = `<tr><td colspan="5">No recent transactions</td></tr>`;
    return;
  }

  snapshot.forEach((doc) => {
    const tx = doc.data();
    const row = document.createElement("tr");

    const date = tx.timestamp?.toDate().toLocaleString() || "-";

    row.innerHTML = `
      <td>${date}</td>
      <td>$${tx.amount?.toFixed(2) || "0.00"}</td>
      <td>${tx.to || "-"}</td>
      <td>${tx.category || "-"}</td>
      <td>${tx.status || "-"}</td>
    `;

    txTable.appendChild(row);
  });
}

// Stub for Add Funds
window.handleAddFunds = (studentId) => {
  alert(`Add Funds to student: ${studentId} (functionality coming soon)`);
};

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
