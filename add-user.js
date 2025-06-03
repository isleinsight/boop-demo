// Firebase imports (required if using type="module")
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global to store user UID between steps
let newUserUID = null;

// Step 1 – Create Auth User
document.getElementById("step1Form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("step1Email").value.trim();
  const password = document.getElementById("step1Password").value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    newUserUID = userCredential.user.uid;

    // Lock Step 1 form and enable Step 2
    document.getElementById("step1Email").disabled = true;
    document.getElementById("step1Password").disabled = true;
    document.getElementById("step1Submit").disabled = true;

    document.getElementById("step2Form").classList.remove("disabled");
    const status = document.getElementById("step1Status");
    status.style.color = "green";
    status.textContent = "Step 1 complete! Now fill in the user details below.";
  } catch (error) {
    console.error("Error in Step 1:", error);
    const status = document.getElementById("step1Status");
    status.style.color = "red";
    if (error.code === "auth/email-already-in-use") {
      status.textContent = "This email is already in use.";
    } else if (error.code === "auth/invalid-email") {
      status.textContent = "Invalid email address.";
    } else if (error.code === "auth/weak-password") {
      status.textContent = "Password is too weak (minimum 6 characters).";
    } else if (error.code === "auth/network-request-failed") {
      status.textContent = "Network error. Please try again.";
    } else {
      status.textContent = "Error: " + error.message;
    }
  }
});

// Step 2 – Save User Data to Firestore
document.getElementById("step2Form").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!newUserUID) {
    document.getElementById("step2Status").textContent = "Please complete Step 1 first.";
    return;
  }

  const firstName = document.getElementById("step2FirstName").value.trim();
  const lastName = document.getElementById("step2LastName").value.trim();
  const role = document.getElementById("step2Role").value;
  const addedBy = auth.currentUser?.uid || "unknown";

  try {
    await setDoc(doc(db, "users", newUserUID), {
      firstName,
      lastName,
      role,
      addedBy,
    });

    const status = document.getElementById("step2Status");
    status.style.color = "green";
    status.textContent = "User successfully added!";
    document.getElementById("step2Form").reset();
  } catch (error) {
    console.error("Error in Step 2:", error);
    const status = document.getElementById("step2Status");
    status.style.color = "red";
    if (error.code === "permission-denied") {
      status.textContent = "Permission denied. Check your Firestore rules.";
    } else {
      status.textContent = "Error: " + error.message;
    }
  }
});
