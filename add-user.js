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

// Init main app and secondary app
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

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
  let createdUserEmail = null;
  let adminEmail = null;

  // ✅ Disable step 2 inputs on page load
  step2Form.querySelectorAll("input, select, button").forEach((el) => {
    el.disabled = true;
  });

  // Track logged-in admin
  onAuthStateChanged(auth, (user) => {
    if (user) {
      adminEmail = user.email;
      console.log("✅ Admin logged in:", adminEmail);
    } else {
      console.warn("🚫 Not logged in. Redirecting to index...");
      window.location.href = "index.html";
    }
  });

  // Step 1 - Create auth user (in secondary app)
  step1Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step1Status.textContent = "Creating user...";

    const email = newEmailInput.value.trim();
    const password = newPasswordInput.value.trim();

    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      createdUserUID = userCredential.user.uid;
      createdUserEmail = email;

      step1Status.style.color = "green";
      step1Status.textContent = "✅ Step 1 complete. Fill in step 2.";

      // Disable step 1, enable step 2
      newEmailInput.disabled = true;
      newPasswordInput.disabled = true;
      step2Form.querySelectorAll("input, select, button").forEach((el) => {
        el.disabled = false;
      });

      // Sign out the newly created user from the secondary app
      await secondaryAuth.signOut();

    } catch (error) {
      console.error("❌ Error creating user:", error);
      step1Status.style.color = "red";
      step1Status.textContent = "❌ " + error.message;
    }
  });

  // Step 2 - Write user details to Firestore
  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "Saving user data...";

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;

    if (!createdUserUID || !createdUserEmail) {
      step2Status.style.color = "red";
      step2Status.textContent = "❌ Step 1 must be completed first.";
      return;
    }

    try {
      await setDoc(doc(db, "users", createdUserUID), {
        email: createdUserEmail,
        firstName,
        lastName,
        role,
        addedBy: adminEmail,
        createdAt: serverTimestamp()
      });

      step2Status.style.color = "green";
      step2Status.textContent = "✅ User successfully saved.";

      // Add reset button
      const resetButton = document.createElement("button");
      resetButton.textContent = "Add Another User";
      resetButton.style.marginTop = "20px";
      resetButton.addEventListener("click", () => {
        window.location.reload();
      });
      step2Form.appendChild(resetButton);

    } catch (error) {
      console.error("❌ Error writing to Firestore:", error);
      step2Status.style.color = "red";
      step2Status.textContent = "❌ " + error.message;
    }
  });

  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      signOut(auth)
        .then(() => {
          window.location.href = "index.html";
        })
        .catch((error) => {
          console.error("Logout error:", error);
          alert("Logout failed.");
        });
    });
  }
});
