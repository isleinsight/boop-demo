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

// Get UID from URL
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");
if (!uid) {
  alert("Missing user ID in URL.");
  throw new Error("Missing user ID");
}

// DOM Elements
const userInfoContainer = document.getElementById("userInfo");
const editBtn = document.getElementById("editProfileBtn");
const saveBtn = document.getElementById("saveProfileBtn");
const editFields = document.getElementById("editFields");
const editFirstName = document.getElementById("editFirstName");
const editLastName = document.getElementById("editLastName");
const editRole = document.getElementById("editRole");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const vendorSection = document.getElementById("vendorInfoSection");
const vendorName = document.getElementById("vendorName");
const vendorCategory = document.getElementById("vendorCategory");
const vendorLocation = document.getElementById("vendorLocation");
const vendorNameInput = document.getElementById("vendorNameInput");
const vendorCategoryInput = document.getElementById("vendorCategoryInput");
const vendorLocationInput = document.getElementById("vendorLocationInput");

// Load User Info
async function loadUserProfile() {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      alert("User not found.");
      return;
    }

    const user = userSnap.data();
    editFirstName.value = user.firstName || "";
    editLastName.value = user.lastName || "";
    editRole.value = user.role || "cardholder";

    userInfoContainer.innerHTML = `
      <div>
        <span class="label">Name</span>
        <span class="value">${user.firstName || ""} ${user.lastName || ""}</span>
      </div>
      <div>
        <span class="label">Email</span>
        <span class="value">${user.email || "-"}</span>
      </div>
      <div>
        <span class="label">Role</span>
        <span class="value">${user.role || "-"}</span>
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

    walletIdEl.textContent = user.walletAddress || "-";
    walletBalanceEl.textContent = `$${(user.balance || 0).toFixed(2)}`;

    // Vendor Info
    if (user.role === "vendor") {
      vendorSection.style.display = "block";
      const vendorSnap = await getDoc(doc(db, "vendors", uid));
      if (vendorSnap.exists()) {
        const vendor = vendorSnap.data();
        vendorName.textContent = vendor.name || "-";
        vendorCategory.textContent = vendor.category || "-";
        vendorLocation.textContent = vendor.location || "-";
        vendorNameInput.value = vendor.name || "";
        vendorCategoryInput.value = vendor.category || "";
        vendorLocationInput.value = vendor.location || "";
      }
    } else {
      vendorSection.style.display = "none";
    }

    // Show student assignment section if parent
    if (user.role === "parent") {
      document.getElementById("addStudentSection").style.display = "block";
    }
  } catch (error) {
    console.error("Error loading profile:", error);
    alert("Error loading user profile.");
  }
}

// Save Profile
saveBtn.addEventListener("click", async () => {
  try {
    await updateDoc(doc(db, "users", uid), {
      firstName: editFirstName.value.trim(),
      lastName: editLastName.value.trim(),
      role: editRole.value
    });

    if (editRole.value === "vendor") {
      await setDoc(doc(db, "vendors", uid), {
        name: vendorNameInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        location: vendorLocationInput.value.trim()
      }, { merge: true });
    }

    alert("✅ Profile updated!");
    window.location.reload();
  } catch (error) {
    console.error("Save error:", error);
    alert("❌ Failed to save profile.");
  }
});

// Edit Mode Toggle
editBtn.addEventListener("click", () => {
  editFields.style.display = "block";
  userInfoContainer.style.display = "none";
  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
  document.querySelectorAll(".edit-field").forEach(el => el.style.display = "block");
  document.querySelectorAll(".value").forEach(el => el.style.display = "none");
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// Auth Check
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadUserProfile();
  } else {
    window.location.href = "index.html";
  }
});
