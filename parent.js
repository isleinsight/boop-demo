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

const logoutBtn = document.getElementById("logoutBtn");
const parentNameDisplay = document.getElementById("parentName");
const studentsList = document.getElementById("studentsList");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists()) return;

  const parentData = userDoc.data();
  if (parentData.role !== "parent") {
    alert("Access restricted to parent accounts.");
    window.location.href = "index.html";
    return;
  }

  parentNameDisplay.textContent = `${parentData.firstName || ""} ${parentData.lastName || ""}`;
  loadStudents(user.uid);
});

async function loadStudents(parentId) {
  const q = query(collection(db, "users"), where("parentId", "==", parentId));
  const snapshot = await getDocs(q);
  studentsList.innerHTML = "";

  if (snapshot.empty) {
    studentsList.innerHTML = "<p>No students assigned.</p>";
    return;
  }

  for (const docSnap of snapshot.docs) {
    const student = docSnap.data();
    const studentId = docSnap.id;

    const card = document.createElement("div");
    card.className = "user-details-grid";
    card.innerHTML = `
      <div>
        <span class="label">Student Name</span>
        <span class="value">${student.firstName || ""} ${student.lastName || ""}</span>
      </div>
      <div>
        <span class="label">Email</span>
        <span class="value">${student.email || ""}</span>
      </div>
      <div>
        <span class="label">Wallet Balance</span>
        <span class="value">${student.walletBalance ? `$${student.walletBalance.toFixed(2)}` : "$0.00"}</span>
      </div>
      <div>
        <span class="label">Recent Transactions</span>
        <ul id="txList-${studentId}"><li>Loading...</li></ul>
      </div>
    `;
    studentsList.appendChild(card);

    loadStudentTransactions(studentId);
  }
}

async function loadStudentTransactions(studentId) {
  const q = query(
    collection(db, "transactions"),
    where("from", "==", studentId),
    orderBy("timestamp", "desc"),
    limit(5)
  );

  const txSnap = await getDocs(q);
  const txList = document.getElementById(`txList-${studentId}`);
  txList.innerHTML = "";

  if (txSnap.empty) {
    txList.innerHTML = "<li>No transactions found.</li>";
    return;
  }

  txSnap.forEach((doc) => {
    const tx = doc.data();
    const li = document.createElement("li");
    li.textContent = `${new Date(tx.timestamp.seconds * 1000).toLocaleString()}: $${tx.amount.toFixed(2)} - ${tx.category}`;
    txList.appendChild(li);
  });
}

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
