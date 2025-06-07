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
  query,
  where,
  collection,
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

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const logoutBtn = document.getElementById("logoutBtn");
const studentNameEl = document.getElementById("studentName");
const studentEmailEl = document.getElementById("studentEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const txBody = document.getElementById("transactionBody");

// Check auth state
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const studentDoc = await getDoc(doc(db, "users", user.uid));
    if (!studentDoc.exists()) throw new Error("Student not found");

    const student = studentDoc.data();
    studentNameEl.textContent = `${student.firstName || ""} ${student.lastName || ""}`;
    studentEmailEl.textContent = student.email || "-";
    walletIdEl.textContent = student.walletId || "N/A";
    walletBalanceEl.textContent = `$${(student.walletBalance || 0).toFixed(2)}`;

    loadTransactions(user.uid);
  } catch (err) {
    console.error("Error loading student data:", err);
    txBody.innerHTML = `<tr><td colspan="5">Failed to load data.</td></tr>`;
  }
});

// Load transactions
async function loadTransactions(studentId) {
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
    txBody.innerHTML = `<tr><td colspan="5">Error loading transactions.</td></tr>`;
  }
}

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});
