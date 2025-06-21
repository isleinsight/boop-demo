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
const sendReceiveButtons = document.getElementById("sendReceiveButtons");

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

      // Show send/receive buttons only if not on assistance
      if (sendReceiveButtons && !data.isOnGovernmentAssistance) {
        sendReceiveButtons.classList.remove("hidden");
      }

      loadTransactions(user.uid);
    }
  } catch (err) {
    console.error("Failed to load cardholder data:", err);
  }
});

// Load transactions for user as sender or receiver
async function loadTransactions(userId) {
  const container = document.getElementById("transactionBody");
  container.innerHTML = `<div class="activity-item">Loading...</div>`;

  try {
    // Query both incoming and outgoing transactions
    const toQuery = query(collection(db, "transactions"), where("to", "==", userId));
    const fromQuery = query(collection(db, "transactions"), where("from", "==", userId));

    const [toSnap, fromSnap] = await Promise.all([
      getDocs(toQuery),
      getDocs(fromQuery)
    ]);

    const transactions = [];

    toSnap.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        ...data,
        direction: "in",
        id: doc.id
      });
    });

    fromSnap.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        ...data,
        direction: "out",
        id: doc.id
      });
    });

    if (transactions.length === 0) {
      container.innerHTML = `<div class="activity-item">No recent activity.</div>`;
      return;
    }

    // Sort newest to oldest
    transactions.sort((a, b) => {
      return b.timestamp?.toDate() - a.timestamp?.toDate();
    });

    // Render all transactions
    container.innerHTML = "";

    transactions.forEach((tx) => {
      const date = tx.timestamp?.toDate().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }) || "-";

      const name = tx.direction === "in" ? tx.fromName : tx.toName;
      const sign = tx.direction === "in" ? "+" : "–";
      const amountClass = tx.direction === "in" ? "in" : "out";

      const item = document.createElement("div");
      item.className = "activity-item";

      item.innerHTML = `
        <div class="activity-details">
          <div class="activity-name">${name || "Unknown"}</div>
          <div class="activity-meta">${date} • ${tx.category || "Payment"}</div>
        </div>
        <div class="activity-amount ${amountClass}">${sign} $${Math.abs(tx.amount || 0).toFixed(2)}</div>
      `;

      container.appendChild(item);
    });

  } catch (err) {
    console.error("Failed to load transactions:", err);
    container.innerHTML = `<div class="activity-item">Error loading activity.</div>`;
  }
}

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
