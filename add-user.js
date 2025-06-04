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

// Init
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

  // Save logged-in admin email
  onAuthStateChanged(auth, (user) => {
    if (user) {
      adminEmail = user.email;
      console.log("Admin logged in:", adminEmail);
    } else {
      console.log("Not logged in. Redirecting...");
      window.location.href = "index.html";
    }
  });

  // Step 1: Create Firebase Auth user
  step1Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step1Status.textContent = "Creating user...";

    const email = newEmailInput.value.trim();
    const password = newPasswordInput.value.trim();

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      createdUserUID = userCredential.user.uid;

      step1Status.style.color = "green";
      step1Status.textContent = "✅ Step 1 complete. Now fill out step 2.";

      newEmailInput.disabled = true;
      newPasswordInput.disabled = true;

      // Enable step 2 form
      step2Form.querySelectorAll("input, select, button").forEach((el) => {
        el.disabled = false;
      });

    } catch (error) {
      console.error("Error creating user:", error);
      step1Status.style.color = "red";
      step1Status.textContent = "❌ " + error.message;
    }
  });

  // Step 2: Save extra user info to Firestore
  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "Saving user data...";

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;

    if (!createdUserUID || !adminEmail) {
      step2Status.style.color = "red";
      step2Status.textContent = "❌ Step 1 must be completed first.";
      return;
    }

    try {
      await setDoc(doc(db, "users", createdUserUID), {
        firstName,
        lastName,
        role,
        addedBy: adminEmail,
        createdAt: serverTimestamp()
      });

      step2Status.style.color = "green";
      step2Status.textContent = "✅ User successfully saved.";

      const resetButton = document.createElement("button");
      resetButton.textContent = "Add Another User";
      resetButton.style.marginTop = "20px";
      resetButton.addEventListener("click", () => {
        window.location.reload();
      });
      step2Form.appendChild(resetButton);

    } catch (error) {
      console.error("Error saving to Firestore:", error);
      step2Status.style.color = "red";
      step2Status.textContent = "❌ " + error.message;
    }
  });

  // Logout button logic
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      signOut(auth).then(() => {
        window.location.href = "index.html";
      }).catch((error) => {
        console.error("Logout error:", error);
        alert("Logout failed.");
      });
    });
  }
});
