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

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM elements
const logoutBtn = document.getElementById("logoutBtn");
const cardholderNameEl = document.getElementById("cardholderName");
const cardholderEmailEl = document.getElementById("cardholderEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const transactionBody = document.getElementById("transactionBody");
const sendReceiveButtons = document.getElementById("sendReceiveButtons"); // ✅ new

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();

      cardholderNameEl.textContent = `${data.firstName || ""} ${data.lastName || ""}`;
      cardholderEmailEl.textContent = data.email || "-";
      walletIdEl.textContent = data.walletId || "N/A";
      walletBalanceEl.textContent = `$${(data.walletBalance || 0).toFixed(2)}`;

      // ✅ Show Send/Receive buttons only if not on assistance
      if (sendReceiveButtons && !data.isOnGovernmentAssistance) {
        sendReceiveButtons.classList.remove("hidden");
      }

      loadTransactions(user.uid);
    }
  } catch (err) {
    console.error("Failed to load cardholder data:", err);
  }
});

// Load transactions
async function loadTransactions(userId) {
  transactionBody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;

  try {
    const q = query(collection(db, "transactions"), where("to", "==", userId));
    const snap = await getDocs(q);

    transactionBody.innerHTML = "";

    if (snap.empty) {
      transactionBody.innerHTML = `<tr><td colspan="5">No recent transactions.</td></tr>`;
      return;
    }

    snap.forEach((doc) => {
      const tx = doc.data();
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
        <td>$${(tx.amount || 0).toFixed(2)}</td>
        <td>${tx.to || "-"}</td>
        <td>${tx.category || "-"}</td>
        <td>${tx.status || "-"}</td>
      `;

      transactionBody.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load transactions:", err);
    transactionBody.innerHTML = `<tr><td colspan="5">Failed to load transactions.</td></tr>`;
  }
}

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
