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
  addDoc,
  collection,
  serverTimestamp
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
const vendorNameEl = document.getElementById("vendorName");
const vendorEmailEl = document.getElementById("vendorEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const businessNameEl = document.getElementById("businessName");
const phoneEl = document.getElementById("phone");
const categoryEl = document.getElementById("category");
const approvedEl = document.getElementById("approved");

const redeemBtn = document.getElementById("redeemBtn");
const redeemModal = document.getElementById("redeemModal");
const redeemAmount = document.getElementById("redeemAmount");
const submitRedeemBtn = document.getElementById("submitRedeemBtn");
const redeemStatus = document.getElementById("redeemStatus");

const txTableBody = document.getElementById("transactionTableBody");

let currentUserId = null;

// Auth Check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUserId = user.uid;

  try {
    // Get core user info from 'users' collection
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    const vendor = docSnap.data();
    vendorNameEl.textContent = `${vendor.firstName || ""} ${vendor.lastName || ""}`;
    vendorEmailEl.textContent = vendor.email || "-";
    walletIdEl.textContent = vendor.walletId || "N/A";
    walletBalanceEl.textContent = `$${(vendor.walletBalance || 0).toFixed(2)}`;

    // Fetch extended vendor info from 'vendors' collection
    const vendorExtraRef = doc(db, "vendors", user.uid);
    const vendorExtraSnap = await getDoc(vendorExtraRef);

    if (vendorExtraSnap.exists()) {
      const vendorExtra = vendorExtraSnap.data();
      businessNameEl.textContent = vendorExtra.name || "-";
      phoneEl.textContent = vendorExtra.phone || "-";
      categoryEl.textContent = vendorExtra.category || "-";
      approvedEl.textContent = vendorExtra.approved ? "Yes" : "No";
    } else {
      businessNameEl.textContent = "-";
      phoneEl.textContent = "-";
      categoryEl.textContent = "-";
      approvedEl.textContent = "-";
    }

    loadTransactions();
  } catch (err) {
    console.error("Error loading vendor data:", err);
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

// Show Redeem Modal
redeemBtn.addEventListener("click", () => {
  redeemModal.style.display = "block";
});

// Submit Redeem Request
submitRedeemBtn.addEventListener("click", async () => {
  const amount = parseFloat(redeemAmount.value);
  if (isNaN(amount) || amount <= 0) {
    redeemStatus.textContent = "❌ Please enter a valid amount.";
    redeemStatus.style.color = "red";
    return;
  }

  try {
    await addDoc(collection(db, "transactions"), {
      from: currentUserId,
      to: "government",
      type: "redeem",
      amount: amount,
      status: "pending",
      timestamp: serverTimestamp()
    });

    redeemStatus.textContent = "✅ Request submitted!";
    redeemStatus.style.color = "green";
    redeemAmount.value = "";
  } catch (err) {
    console.error("Redeem failed:", err);
    redeemStatus.textContent = "❌ Failed to submit request.";
    redeemStatus.style.color = "red";
  }
});

// Load transactions
async function loadTransactions() {
  txTableBody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

  try {
    const q = collection(db, "transactions");
    const snap = await getDocs(q);
    const filtered = snap.docs
      .map(doc => doc.data())
      .filter(tx => tx.to === currentUserId || tx.from === currentUserId);

    if (filtered.length === 0) {
      txTableBody.innerHTML = "<tr><td colspan='5'>No recent transactions.</td></tr>";
      return;
    }

    txTableBody.innerHTML = "";

    filtered.forEach(tx => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
        <td>$${(tx.amount || 0).toFixed(2)}</td>
        <td>${tx.from || "-"}</td>
        <td>${tx.transactionId || "-"}</td>
        <td>${tx.status || "-"}</td>
      `;
      txTableBody.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load transactions:", err);
    txTableBody.innerHTML = "<tr><td colspan='5'>Failed to load transactions.</td></tr>";
  }
}
