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

// DOM
const logoutBtn = document.getElementById("logoutBtn");
const parentNameEl = document.getElementById("parentName");
const parentEmailEl = document.getElementById("parentEmail");
const studentsList = document.getElementById("studentsList");

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const parentDoc = await getDoc(doc(db, "users", user.uid));
  if (!parentDoc.exists()) return;

  const parent = parentDoc.data();
  parentNameEl.textContent = `${parent.firstName || ""} ${parent.lastName || ""}`;
  parentEmailEl.textContent = parent.email || "-";

  const studentsSnap = await getDocs(query(collection(db, "users"), where("parentId", "==", user.uid)));
  studentsList.innerHTML = "";

  for (const studentDoc of studentsSnap.docs) {
    const student = studentDoc.data();
    const studentId = studentDoc.id;
    const balance = student.walletBalance ? `$${student.walletBalance.toFixed(2)}` : "$0.00";

    const txSnap = await getDocs(
      query(collection(db, "transactions"), where("to", "==", studentId), orderBy("timestamp", "desc"), limit(3))
    );

    let txHtml = "";
    if (txSnap.empty) {
      txHtml = `<p style="color:#555; margin-left: 15px;">No transactions found.</p>`;
    } else {
      txHtml = "<ul>";
      txSnap.forEach((txDoc) => {
        const tx = txDoc.data();
        txHtml += `<li>${tx.timestamp?.toDate().toLocaleString() || "-"} - $${tx.amount || 0}</li>`;
      });
      txHtml += "</ul>";
    }

    const card = document.createElement("div");
    card.className = "student-card";
    card.style.marginBottom = "40px";
    card.innerHTML = `
      <div class="section-title">Student: ${student.firstName || ""} ${student.lastName || ""}</div>
      <div class="user-details-grid">
        <div>
          <span class="label">Email</span>
          <span class="value">${student.email || "-"}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="label">Wallet Balance</span>
            <span class="value">${balance}</span>
          </div>
          <button class="btnEdit" onclick="addFunds('${studentId}')">Add Funds</button>
        </div>
      </div>
      <div style="margin-top: 20px;">
        <div class="section-title">Recent Transactions</div>
        ${txHtml}
      </div>
    `;

    studentsList.appendChild(card);
  }
});

// Placeholder function
window.addFunds = function (studentId) {
  alert(`Add Funds clicked for student: ${studentId}`);
};

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
