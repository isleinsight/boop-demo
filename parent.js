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
  getDoc,
  getDocs,
  doc,
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const logoutBtn = document.getElementById("logoutBtn");
const studentsList = document.getElementById("studentsList");

// Auth Check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists() || userDoc.data().role !== "parent") {
      alert("Access denied.");
      window.location.href = "index.html";
      return;
    }

    loadStudents(user.uid);
  } else {
    window.location.href = "index.html";
  }
});

// Load Students assigned to this parent
async function loadStudents(parentId) {
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snap = await getDocs(q);

  studentsList.innerHTML = "";

  if (snap.empty) {
    studentsList.innerHTML = "<p>No students assigned to you.</p>";
    return;
  }

  snap.forEach(async (docSnap) => {
    const student = docSnap.data();
    const studentId = docSnap.id;

    const card = document.createElement("div");
    card.className = "student-card";
    card.style.marginBottom = "30px";

    card.innerHTML = `
      <div class="section-title">Your Student: ${student.firstName || ""} ${student.lastName || ""}</div>
      <div class="user-details-grid">
        <div>
          <span class="label">Email</span>
          <span class="value">${student.email || "-"}</span>
        </div>
        <div>
          <span class="label">Wallet Balance</span>
          <span class="value">${student.walletBalance ? `$${student.walletBalance.toFixed(2)}` : "$0.00"}</span>
        </div>
      </div>
      <div class="section-title" style="margin-top: 25px;">Recent Transactions</div>
      <div class="user-details-grid" id="txGrid-${studentId}">
        <div style="grid-column: 1 / -1;"><em>Loading...</em></div>
      </div>
    `;

    studentsList.appendChild(card);
    loadStudentTransactions(studentId);
  });
}

// Load Recent Transactions
async function loadStudentTransactions(studentId) {
  const txRef = collection(db, "transactions");
  const q = query(txRef, where("from", "==", studentId), orderBy("timestamp", "desc"), limit(5));
  const txSnap = await getDocs(q);

  const txGrid = document.getElementById(`txGrid-${studentId}`);
  txGrid.innerHTML = "";

  if (txSnap.empty) {
    txGrid.innerHTML = `<div style="grid-column: 1 / -1;"><em>No transactions found.</em></div>`;
    return;
  }

  txSnap.forEach((doc) => {
    const tx = doc.data();
    const txBox = document.createElement("div");
    txBox.style = "grid-column: 1 / -1; background: #f9fafc; padding: 10px; border-radius: 6px; margin-bottom: 5px;";
    txBox.innerHTML = `
      <span class="label">${new Date(tx.timestamp.seconds * 1000).toLocaleString()}</span>
      <div class="value">
        <strong>$${tx.amount.toFixed(2)}</strong> - ${tx.category || "Unknown"}<br />
        From: ${tx.from || "N/A"} | To: ${tx.to || "N/A"}
      </div>
    `;
    txGrid.appendChild(txBox);
  });
}

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
