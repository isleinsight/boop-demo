import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ add-user.js loaded");

  const step1Form = document.getElementById("step1Form");
  const step2Form = document.getElementById("step2Form");

  const newEmailInput = document.getElementById("newEmail");
  const newPasswordInput = document.getElementById("newPassword");

  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");

  const step1Status = document.getElementById("step1Status");
  const step2Status = document.getElementById("step2Status");

  let createdUserUID = null;
  let adminEmail = null;

  // Disable Step 2 initially
  step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = true);

  // Detect admin login
  onAuthStateChanged(auth, (user) => {
    if (user) {
      adminEmail = user.email;
      console.log("Admin logged in:", adminEmail);
    } else {
      alert("You must be logged in to access this page.");
      window.location.href = "index.html";
    }
  });

  // Step 1: Create Auth User
  step1Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step1Status.textContent = "⏳ Creating user...";

    const email = newEmailInput.value.trim();
    const password = newPasswordInput.value.trim();

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      createdUserUID = userCredential.user.uid;

      step1Status.style.color = "green";
      step1Status.textContent = "✅ Step 1 complete. Now continue below.";

      // Disable Step 1, enable Step 2
      newEmailInput.disabled = true;
      newPasswordInput.disabled = true;
      step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = false);

    } catch (error) {
      console.error("Error creating user:", error);
      step1Status.style.color = "red";
      step1Status.textContent = "❌ " + error.message;
    }
  });

  // Step 2: Write user details to Firestore
  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "⏳ Saving user data...";

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;

    if (!createdUserUID) {
      step2Status.style.color = "red";
      step2Status.textContent = "❌ Step 1 is not complete.";
      return;
    }

    try {
      await setDoc(doc(db, "users", createdUserUID), {
        firstName,
        lastName,
        role,
        email: newEmailInput.value.trim(),
        addedBy: adminEmail,
        createdAt: serverTimestamp()
      });

      step2Status.style.color = "green";
      step2Status.textContent = "✅ User successfully saved to database.";

      // Add "Add Another User" button
      const resetBtn = document.createElement("button");
      resetBtn.textContent = "Add Another User";
      resetBtn.style.marginTop = "20px";
      resetBtn.onclick = () => window.location.reload();
      step2Form.appendChild(resetBtn);

    } catch (error) {
      console.error("Error saving user to Firestore:", error);
      step2Status.style.color = "red";
      step2Status.textContent = "❌ " + error.message;
    }
  });

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      signOut(auth)
        .then(() => {
          window.location.href = "index.html";
        })
        .catch((error) => {
          console.error("Logout failed:", error);
          alert("Failed to log out.");
        });
    });
  }
});
