import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Track who is logged in
let currentAdminEmail = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentAdminEmail = user.email;
  } else {
    window.location.href = "index.html"; // Redirect if not logged in
  }
});

// Step 1: Create user in Firebase Auth
const step1Form = document.getElementById("step1Form");
const step2Form = document.getElementById("step2Form");
const step1Status = document.getElementById("step1Status");
const step2Status = document.getElementById("step2Status");
const step1Inputs = step1Form.querySelectorAll("input");
const step2Inputs = step2Form.querySelectorAll("input, select");
const addAnotherBtn = document.getElementById("addAnotherBtn");

let createdUserUID = null;

step1Form.addEventListener("submit", async (e) => {
  e.preventDefault();
  step1Status.textContent = "Creating user...";
  step1Status.style.color = "black";

  const email = document.getElementById("newEmail").value.trim();
  const password = document.getElementById("newPassword").value.trim();

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    createdUserUID = userCredential.user.uid;

    step1Status.textContent = "Step 1 complete!";
    step1Status.style.color = "green";

    // Disable Step 1 inputs
    step1Inputs.forEach((input) => input.disabled = true);
    step2Inputs.forEach((input) => input.disabled = false);

    // Show step 2 form
    step2Form.style.opacity = "1";
  } catch (error) {
    console.error("Error in Step 1:", error);
    step1Status.textContent = error.message;
    step1Status.style.color = "red";
  }
});

// Step 2: Write to Firestore
step2Form.addEventListener("submit", async (e) => {
  e.preventDefault();
  step2Status.textContent = "Saving user details...";
  step2Status.style.color = "black";

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const role = document.getElementById("role").value;

  if (!createdUserUID) {
    step2Status.textContent = "Error: User not created in Step 1.";
    step2Status.style.color = "red";
    return;
  }

  try {
    await setDoc(doc(db, "users", createdUserUID), {
      firstName,
      lastName,
      role,
      addedBy: currentAdminEmail || "unknown"
    });

    step2Status.textContent = "User successfully saved!";
    step2Status.style.color = "green";

    // Show Add Another button
    addAnotherBtn.style.display = "inline-block";
  } catch (error) {
    console.error("Error in Step 2:", error);
    step2Status.textContent = error.message;
    step2Status.style.color = "red";
  }
});

// Add Another User button (refreshes the page)
addAnotherBtn.addEventListener("click", () => {
  location.reload();
});
