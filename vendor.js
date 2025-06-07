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

let currentUserId = null;

// Auth Check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUserId = user.uid;

  try {
    // Load base user info
    const userDoc = await getDoc(doc(db, "users", currentUserId));
    if (!userDoc.exists()) throw new Error("User doc not found");
    const userData = userDoc.data();

    vendorNameEl.textContent = `${userData.firstName || ""} ${userData.lastName || ""}`;
    vendorEmailEl.textContent = userData.email || "-";
    walletIdEl.textContent = userData.walletId || "N/A";
    walletBalanceEl.textContent = `$${(userData.walletBalance || 0).toFixed(2)}`;

    // Load vendor-specific info
    const vendorDoc = await getDoc(doc(db, "vendors", currentUserId));
    if (vendorDoc.exists()) {
      const vendor = vendorDoc.data();
      businessNameEl.textContent = vendor.name || "-";
      phoneEl.textContent = vendor.phone || "-";
      categoryEl.textContent = vendor.category || "-";
      approvedEl.textContent = vendor.approved ? "Yes" : "No";
    } else {
      businessNameEl.textContent = "-";
      phoneEl.textContent = "-";
      categoryEl.textContent = "-";
      approvedEl.textContent = "-";
    }
  } catch (error) {
    console.error("Error loading vendor:", error);
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
