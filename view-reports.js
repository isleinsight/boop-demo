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
  Timestamp
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

// Elements
const reportsTable = document.getElementById("reportsTable").querySelector("tbody");
const filterCategory = document.getElementById("filterCategory");
const filterStartDate = document.getElementById("filterStartDate");
const filterEndDate = document.getElementById("filterEndDate");
const filterBtn = document.getElementById("applyFilters");

// Load transactions
async function loadTransactions() {
  reportsTable.innerHTML = "";

  let q = collection(db, "transactions");

  const filters = [];
  const selectedCategory = filterCategory.value.trim();
  const start = filterStartDate.value;
  const end = filterEndDate.value;

  if (selectedCategory) {
    filters.push(where("category", "==", selectedCategory));
  }

  if (start) {
    filters.push(where("timestamp", ">=", Timestamp.fromDate(new Date(start))));
  }

  if (end) {
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() + 1); // include the full day
    filters.push(where("timestamp", "<", Timestamp.fromDate(endDate)));
  }

  if (filters.length > 0) {
    q = query(q, ...filters);
  }

  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    const tx = doc.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
      <td>$${(tx.amount || 0).toFixed(2)}</td>
      <td>${tx.from || "-"}</td>
      <td>${tx.to || "-"}</td>
      <td>${tx.category || "-"}</td>
      <td>${tx.transactionId || doc.id}</td>
      <td>${tx.status || "-"}</td>
    `;
    reportsTable.appendChild(row);
  });
}

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadTransactions();
  } else {
    window.location.href = "index.html";
  }
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Apply filters
filterBtn.addEventListener("click", (e) => {
  e.preventDefault();
  loadTransactions();
});
