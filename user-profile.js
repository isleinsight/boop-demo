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
  updateDoc,
  setDoc,
  collection,
  query,
  where
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
const auth = getAuth(app);
const db = getFirestore(app);

// UID from URL
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

// Elements
const userInfoContainer = document.getElementById("userInfo");
const vendorInfoBox = document.getElementById("vendorInfoBox");
const transactionTable = document.getElementById("transactionTable").querySelector("tbody");

const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const cardUidEl = document.getElementById("cardUid");
const cardTypeEl = document.getElementById("cardType");
const issueDateEl = document.getElementById("issueDate");
const isActiveEl = document.getElementById("isActive");

const vendorNameEl = document.getElementById("vendorName");
const vendorCategoryEl = document.getElementById("vendorCategory");
const vendorLocationEl = document.getElementById("vendorLocation");

const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const editFields = document.getElementById("editFields");

const editFirstName = document.getElementById("editFirstName");
const editLastName = document.getElementById("editLastName");
const editRole = document.getElementById("editRole");

const vendorNameInput = document.getElementById("vendorNameInput");
const vendorCategoryInput = document.getElementById("vendorCategoryInput");
const vendorLocationInput = document.getElementById("vendorLocationInput");

let currentUserData = null;

// Load profile
async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    alert("User not found.");
    return;
  }

  const user = userDoc.data();
  currentUserData = user;

  // Basic info
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

  editFirstName.value = user.firstName || "";
  editLastName.value = user.lastName || "";
  editRole.value = user.role || "cardholder";

  walletIdEl.textContent = user.walletAddress || "-";
  walletBalanceEl.textContent = `$${(user.balance || 0).toFixed(2)}`;

  // Card
  const cardSnap = await getDocs(query(collection(db, "cards"), where("assignedTo", "==", uid)));
  if (!cardSnap.empty) {
    const card = cardSnap.docs[0].data();
    cardUidEl.textContent = card.cardUid || "-";
    cardTypeEl.textContent = card.cardType || "-";
    issueDateEl.textContent = card.issueDate?.toDate().toLocaleDateString() || "-";
    isActiveEl.textContent = card.isActive ? "Yes" : "No";
  }

  // Vendor
  if (user.role === "vendor") {
    const vendorDoc = await getDoc(doc(db, "vendors", uid));
    if (vendorDoc.exists()) {
      const vendor = vendorDoc.data();
      vendorInfoBox.style.display = "block";

      vendorNameEl.textContent = vendor.name || "-";
      vendorCategoryEl.textContent = vendor.category || "-";
      vendorLocationEl.textContent = vendor.location || "-";

      vendorNameInput.value = vendor.name || "";
      vendorCategoryInput.value = vendor.category || "";
      vendorLocationInput.value = vendor.location || "";
    }
  }

  // Children
  if (user.role === "parent") {
    const kidsSnap = await getDocs(query(collection(db, "users"), where("parentId", "==", uid)));
    const childrenList = document.getElementById("childrenList");
    if (!kidsSnap.empty) {
      let html = "<h2>Children</h2><ul>";
      kidsSnap.forEach(doc => {
        const child = doc.data();
        html += `<li><a href="user-profile.html?uid=${doc.id}">${child.firstName} ${child.lastName}</a></li>`;
      });
      html += "</ul>";
      childrenList.innerHTML = html;
    }
  }

  // Transactions
  const txSnap = await getDocs(query(collection(db, "transactions"), where("to", "==", uid)));
  transactionTable.innerHTML = "";
  for (const docSnap of txSnap.docs) {
    const tx = docSnap.data();
    let category = "-";
    if (tx.from) {
      const vendorDoc = await getDoc(doc(db, "vendors", tx.from));
      if (vendorDoc.exists()) {
        category = vendorDoc.data().category || "-";
      }
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${tx.timestamp?.toDate().toLocaleString() || "-"}</td>
      <td>$${(tx.amount || 0).toFixed(2)}</td>
      <td>${tx.from || "-"}</td>
      <td>${tx.to || "-"}</td>
      <td>${category}</td>
      <td>${tx.transactionId || docSnap.id}</td>
      <td>${tx.status || "-"}</td>
    `;
    transactionTable.appendChild(row);
  }
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

// Edit mode
editBtn.addEventListener("click", () => {
  editFields.style.display = "block";
  userInfoContainer.style.display = "none";
  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
});

// Save changes
saveBtn.addEventListener("click", async () => {
  const updated = {
    firstName: editFirstName.value.trim(),
    lastName: editLastName.value.trim(),
    role: editRole.value
  };

  try {
    await updateDoc(doc(db, "users", uid), updated);

    if (updated.role === "vendor") {
      await setDoc(doc(db, "vendors", uid), {
        name: vendorNameInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        location: vendorLocationInput.value.trim()
      }, { merge: true });
    }

    alert("✅ Profile updated!");
    window.location.reload();
  } catch (error) {
    console.error("Error updating profile:", error);
    alert("❌ Update failed.");
  }
});
