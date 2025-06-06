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
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  increment
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

// DOM elements
const logoutBtn = document.getElementById("logoutBtn");
const parentNameEl = document.getElementById("parentName");
const parentEmailEl = document.getElementById("parentEmail");
const studentsContainer = document.getElementById("studentsContainer");

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "index.html");

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists()) return alert("User not found.");

  const parent = userDoc.data();
  if (parent.role !== "parent") {
    alert("Unauthorized. Parents only.");
    return (window.location.href = "index.html");
  }

  parentNameEl.textContent = `${parent.firstName || ""} ${parent.lastName || ""}`;
  parentEmailEl.textContent = parent.email || "-";

  loadStudents(user.uid);
});

// Load students
async function loadStudents(parentId) {
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snap = await getDocs(q);
  studentsContainer.innerHTML = "";

  if (snap.empty) {
    studentsContainer.innerHTML = "<p>No students assigned yet.</p>";
    return;
  }

  for (const docSnap of snap.docs) {
    const student = docSnap.data();
    const studentId = docSnap.id;
    const balance = student.balance ? `$${student.balance.toFixed(2)}` : "$0.00";

    // Transactions
    const txQuery = query(
      collection(db, "transactions"),
      where("from", "==", studentId),
      orderBy("timestamp", "desc"),
      limit(5)
    );
    const txSnap = await getDocs(txQuery);
    let txHtml = "";

    if (txSnap.empty) {
      txHtml = "<p>No transactions found.</p>";
    } else {
      txHtml = `
        <table class="transaction-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Amount</th>
              <th>To</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${txSnap.docs.map(txDoc => {
              const tx = txDoc.data();
              return `
                <tr>
                  <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
                  <td>$${(tx.amount || 0).toFixed(2)}</td>
                  <td>${tx.to || "-"}</td>
                  <td>${tx.status || "-"}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>`;
    }

    // Student Card
    const card = document.createElement("div");
    card.style.marginBottom = "30px";
    card.innerHTML = `
      <div class="section-title">Student: ${student.firstName || ""} ${student.lastName || ""}</div>
      <div class="user-details-grid">
        <div>
          <span class="label">Email</span>
          <span class="value">${student.email || "-"}</span>
        </div>
        <div>
          <span class="label">Wallet Balance</span>
          <span class="value">${balance}</span>
          <button class="btnEdit" onclick="addFunds('${studentId}')">Add Funds</button>
        </div>
      </div>
      <div style="margin-top: 20px;">
        <div class="section-title">Recent Transactions</div>
        ${txHtml}
      </div>
    `;
    studentsContainer.appendChild(card);
  }
}

// Add funds
window.addFunds = async function (studentId) {
  const amountStr = prompt("Enter amount to add (numbers only):");
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    alert("Invalid amount.");
    return;
  }

  try {
    await updateDoc(doc(db, "users", studentId), {
      balance: increment(amount)
    });
    alert("✅ Funds added.");
    loadStudents(auth.currentUser.uid);
  } catch (err) {
    console.error("Add funds error:", err);
    alert("Failed to add funds.");
  }
};

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
