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

// Get user ID from URL
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

// DOM elements
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const transactionTable = document.getElementById("transactionTable").querySelector("tbody");

const cardUidEl = document.getElementById("cardUid");
const cardTypeEl = document.getElementById("cardType");
const issueDateEl = document.getElementById("issueDate");
const isActiveEl = document.getElementById("isActive");

const vendorNameEl = document.getElementById("vendorName");
const vendorCategoryEl = document.getElementById("vendorCategory");
const vendorLocationEl = document.getElementById("vendorLocation");

const childrenContainer = document.getElementById("childrenList");
const userInfoContainer = document.getElementById("userInfo");

// Load profile data
async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    alert("User not found.");
    return;
  }

  const user = userDoc.data();

  // Basic user details
  userInfoContainer.innerHTML = `
    <div>
      <span class="label">Name</span>
      <span class="value">${user.firstName || ""} ${user.lastName || ""}</span>
    </div>
    <div>
      <span class="label">Email</span>
      <span class="value">${user.email || ""}</span>
    </div>
    <div>
      <span class="label">Role</span>
      <span class="value">${user.role || ""}</span>
    </div>
    <div>
      <span class="label">Wallet Address</span>
      <span class="value">${user.walletAddress || "-"}</span>
    </div>
    <div>
      <span class="label">Added By</span>
      <span class="value">${user.addedBy || "-"}</span>
    </div>
    <div>
      <span class="label">Created At</span>
      <span class="value">${user.createdAt?.toDate().toLocaleString() || "-"}</span>
    </div>
  `;

  // Wallet info
  walletIdEl.textContent = user.walletAddress || "-";
  walletBalanceEl.textContent = `$${(user.balance || 0).toFixed(2)}`;

  // Card info
  const cardSnap = await getDocs(query(collection(db, "cards"), where("assignedTo", "==", uid)));
  if (!cardSnap.empty) {
    const card = cardSnap.docs[0].data();
    cardUidEl.textContent = card.cardUid || "-";
    cardTypeEl.textContent = card.cardType || "-";
    issueDateEl.textContent = card.issueDate?.toDate().toLocaleDateString() || "-";
    isActiveEl.textContent = card.isActive ? "Yes" : "No";
  }

  // Vendor info
  if (user.role === "vendor") {
    const vendorDoc = await getDoc(doc(db, "vendors", uid));
    if (vendorDoc.exists()) {
      const vendor = vendorDoc.data();
      vendorNameEl.textContent = vendor.name || "-";
      vendorCategoryEl.textContent = vendor.category || "-";
      vendorLocationEl.textContent = vendor.location || "-";
    }
  }

  // Child users (if parent)
  if (user.role === "parent") {
    const kidsSnap = await getDocs(query(collection(db, "users"), where("parentId", "==", uid)));
    if (!kidsSnap.empty) {
      let html = "<ul>";
      kidsSnap.forEach(doc => {
        const child = doc.data();
        html += `<li><a href="user-profile.html?uid=${doc.id}">${child.firstName} ${child.lastName}</a></li>`;
      });
      html += "</ul>";
      childrenContainer.innerHTML = html;
    }
  }

  // Transactions
  const txSnap = await getDocs(query(collection(db, "transactions"), where("to", "==", uid)));
  transactionTable.innerHTML = "";
  txSnap.forEach(doc => {
    const tx = doc.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
      <td>$${(tx.amount || 0).toFixed(2)}</td>
      <td>${tx.from || "-"}</td>
      <td>${tx.to || "-"}</td>
      <td>${tx.transactionId || doc.id}</td>
      <td>${tx.status || "-"}</td>
    `;
    transactionTable.appendChild(row);
  });
}

// Auth check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUserProfile(uid);
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
