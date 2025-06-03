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

// Init services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Track logged-in admin
let currentAdmin = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentAdmin = user;
    console.log("Admin logged in:", user.email);
  } else {
    window.location.href = "login.html"; // Not logged in
  }
});

// Elements
const step1Form = document.getElementById("step1Form");
const step2Form = document.getElementById("step2Form");
const step1Status = document.getElementById("step1Status");
const step2Status = document.getElementById("step2Status");
const newEmailInput = document.getElementById("newEmail");
const newPasswordInput = document.getElementById("newPassword");
const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const roleInput = document.getElementById("role");

// Disable step 2 initially
step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = true);

let createdUserUID = null;

// Step 1: Create Auth user
step1Form.addEventListener("submit", async (e) => {
  e.preventDefault();
  step1Status.textContent = "";
  step1Status.style.color = "black";

  const email = newEmailInput.value.trim();
  const password = newPasswordInput.value;

  if (!email || !password) {
    step1Status.textContent = "Email and password are required.";
    step1Status.style.color = "red";
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    createdUserUID = userCredential.user.uid;

    // Disable step 1 form
    step1Form.querySelectorAll("input, button").forEach(el => el.disabled = true);

    // Enable step 2 form
    step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = false);

    step1Status.textContent = "User account created. Please complete step 2.";
    step1Status.style.color = "green";
  } catch (error) {
    console.error(error);
    step1Status.textContent = "Error: " + error.message;
    step1Status.style.color = "red";
  }
});

// Step 2: Add user profile to Firestore
step2Form.addEventListener("submit", async (e) => {
  e.preventDefault();
  step2Status.textContent = "";
  step2Status.style.color = "black";

  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const role = roleInput.value;

  if (!firstName || !lastName || !role) {
    step2Status.textContent = "All fields are required.";
    step2Status.style.color = "red";
    return;
  }

  if (!createdUserUID) {
    step2Status.textContent = "User was not created in step 1.";
    step2Status.style.color = "red";
    return;
  }

  try {
    await setDoc(doc(db, "users", createdUserUID), {
      firstName,
      lastName,
      role,
      addedBy: currentAdmin?.email || "Unknown",
      createdAt: serverTimestamp()
    });

    step2Status.textContent = "User profile saved successfully!";
    step2Status.style.color = "green";

    // Show "Add another" button
    document.getElementById("addAnotherBtn").style.display = "inline-block";
  } catch (error) {
    console.error(error);
    step2Status.textContent = "Error: " + error.message;
    step2Status.style.color = "red";
  }
});

// Add Another button resets the forms
document.getElementById("addAnotherBtn").addEventListener("click", () => {
  // Reset values
  createdUserUID = null;
  newEmailInput.value = "";
  newPasswordInput.value = "";
  firstNameInput.value = "";
  lastNameInput.value = "";
  roleInput.value = "";

  step1Status.textContent = "";
  step2Status.textContent = "";

  // Enable step 1, disable step 2
  step1Form.querySelectorAll("input, button").forEach(el => el.disabled = false);
  step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = true);

  // Hide add another button again
  document.getElementById("addAnotherBtn").style.display = "none";
});

// Logout button
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
