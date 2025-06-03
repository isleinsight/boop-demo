import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Form elements
const authForm = document.getElementById("authForm");
const detailsForm = document.getElementById("detailsForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const statusMsg = document.getElementById("statusMsg");

let createdUser = null;

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    statusMsg.textContent = "Email and password are required.";
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    createdUser = userCredential.user;
    statusMsg.style.color = "green";
    statusMsg.textContent = "User created. Enter the remaining details.";
    
    // Disable first form and enable second
    emailInput.disabled = true;
    passwordInput.disabled = true;
    authForm.querySelector("button").disabled = true;
    detailsForm.querySelectorAll("input, select, button").forEach(el => el.disabled = false);
    
    // Autofill email in step 2 for reference
    document.getElementById("userEmail").value = email;

  } catch (error) {
    statusMsg.style.color = "red";
    statusMsg.textContent = "Error: " + error.message;
  }
});

detailsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!createdUser) {
    statusMsg.textContent = "Please create the user first.";
    return;
  }

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const role = document.getElementById("role").value;
  const wallet = document.getElementById("walletAddress").value.trim();

  try {
    await setDoc(doc(db, "users", createdUser.uid), {
      firstName,
      lastName,
      email: createdUser.email,
      role,
      walletAddress: wallet,
      addedBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });

    statusMsg.style.color = "green";
    statusMsg.textContent = "User details saved successfully.";
    detailsForm.reset();

  } catch (error) {
    statusMsg.style.color = "red";
    statusMsg.textContent = "Error saving user details: " + error.message;
  }
});
