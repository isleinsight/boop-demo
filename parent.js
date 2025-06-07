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
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit
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

// DOM Elements
const parentNameEl = document.getElementById("parentName");
const parentEmailEl = document.getElementById("parentEmail");
const studentsList = document.getElementById("studentsList");
const logoutBtn = document.getElementById("logoutBtn");

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadParentDashboard(user.uid);
  } else {
    window.location.href = "index.html";
  }
});

async function loadParentDashboard(parentUid) {
  const parentRef = doc(db, "users", parentUid);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) {
    alert("Parent user not found");
    return;
  }

  const parent = parentSnap.data();

  // ✅ Populate parent name and email
  parentNameEl.textContent = `${parent.firstName || "-"}`;
  parentEmailEl.textContent = `${parent.email || "-"}`;

  // ✅ Load students
  const q = query(collection(db, "users"), where("parentId", "==", parentUid));
  const studentSnap = await getDocs(q);

  studentsList.innerHTML = "";

  if (studentSnap.empty) {
    studentsList.innerHTML = "<p>No students assigned.</p>";
    return;
  }

  for (const docSnap of studentSnap.docs) {
    const student = docSnap.data();
    const studentId = docSnap.id;

    const box = document.createElement("div");
    box.className = "student-box";

    const name = `${student.firstName || ""} ${student.lastName || ""}`;
    const email = student.email || "-";
    const walletId = student.walletId || "N/A";
    const balance = student.walletBalance !== undefined
      ? `$${student.walletBalance.toFixed(2)}`
      : "$0.00";

    box.innerHTML = `
      <div class="user-details-grid">
        <div><span class="label">Name</span><span class="value">${name}</span></div>
        <div><span class="label">Email</span><span class="value">${email}</span></div>
        <div><span class="label">Wallet ID</span><span class="value">${walletId}</span></div>
        <div><span class="label">Balance</span><span class="value">${balance}</span></div>
      </div>
      <div class="section-title" style="margin-top: 25px;">Recent Transactions</div>
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
      <div style="text-align: right; margin-top: 10px;">
        <button class="btnEdit" onclick="alert('TODO: Add funds to ${name}')">Add Funds</button>
      </div>
    `;

    studentsList.appendChild(box);
    loadTransactionsForStudent(studentId);
  }
}

async function loadTransactionsForStudent(studentId) {
  const txBody = document.getElementById(`tx-${studentId}`);
  const q = query(
    collection(db, "transactions"),
    where("to", "==", studentId),
    orderBy("timestamp", "desc"),
    limit(5)
  );

  try {
    const snap = await getDocs(q);
    txBody.innerHTML = "";

    if (snap.empty) {
      txBody.innerHTML = `<tr><td colspan="5">No recent transactions</td></tr>`;
      return;
    }

    for (const docSnap of snap.docs) {
      const tx = docSnap.data();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
        <td>$${(tx.amount || 0).toFixed(2)}</td>
        <td>${tx.to || "-"}</td>
        <td>${tx.category || "-"}</td>
        <td>${tx.status || "-"}</td>
      `;
      txBody.appendChild(row);
    }
  } catch (error) {
    txBody.innerHTML = `<tr><td colspan="5">Failed to load transactions.</td></tr>`;
    console.error("Transaction error:", error);
  }
}

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
