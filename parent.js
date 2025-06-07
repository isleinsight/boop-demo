// Firebase v10 imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
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

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const logoutBtn = document.getElementById("logoutBtn");
const parentNameEl = document.getElementById("parentName");
const parentEmailEl = document.getElementById("parentEmail");
const studentsList = document.getElementById("studentsList");
const addFundsBtn = document.getElementById("addFundsBtn");

// Auth Check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const parentDoc = await getDoc(doc(db, "users", user.uid));
    if (parentDoc.exists()) {
      const parent = parentDoc.data();
      parentNameEl.textContent = `${parent.firstName || ""} ${parent.lastName || ""}`;
      parentEmailEl.textContent = parent.email || "-";
      loadStudents(user.uid);
    }
  } catch (err) {
    console.error("Error loading parent:", err);
  }
});

// Load students assigned to this parent
async function loadStudents(parentId) {
  studentsList.innerHTML = "";
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snap = await getDocs(q);

  for (const studentDoc of snap.docs) {
    const student = studentDoc.data();
    const studentId = studentDoc.id;

    const box = document.createElement("div");
    box.className = "user-details-grid";
    box.innerHTML = `
      <div>
        <span class="label">Name</span>
        <span class="value">${student.firstName || ""} ${student.lastName || ""}</span>
      </div>
      <div>
        <span class="label">Email</span>
        <span class="value">${student.email || "-"}</span>
      </div>
      <div>
        <span class="label">Wallet ID</span>
        <span class="value">${student.walletId || "N/A"}</span>
      </div>
      <div>
        <span class="label">Balance</span>
        <span class="value">$${(student.walletBalance || 0).toFixed(2)}</span>
      </div>
    `;
    studentsList.appendChild(box);

    const section = document.createElement("div");
    section.innerHTML = `
      <div class="section-title">Recent Transactions</div>
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
    `;
    studentsList.appendChild(section);

    loadTransactions(studentId);
  }
}

// Load student transactions
async function loadTransactions(studentId) {
  const txBody = document.getElementById(`tx-${studentId}`);
  if (!txBody) return;

  try {
    const q = query(collection(db, "transactions"), where("to", "==", studentId));
    const snap = await getDocs(q);
    txBody.innerHTML = "";

    if (snap.empty) {
      txBody.innerHTML = `<tr><td colspan="5">No recent transactions.</td></tr>`;
      return;
    }

    snap.forEach(doc => {
      const tx = doc.data();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
        <td>$${(tx.amount || 0).toFixed(2)}</td>
        <td>${tx.to || "-"}</td>
        <td>${tx.category || "-"}</td>
        <td>${tx.status || "-"}</td>
      `;
      txBody.appendChild(row);
    });
  } catch (err) {
    console.error("Transaction fetch failed", err);
    txBody.innerHTML = `<tr><td colspan="5">Failed to load transactions.</td></tr>`;
  }
}

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

// Add Funds button
addFundsBtn.addEventListener("click", () => {
  alert("Add Funds functionality will go here!");
});
