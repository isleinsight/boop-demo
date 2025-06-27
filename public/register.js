console.log("gov-logic.js loaded");

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// DOM elements
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginStatus.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    loginStatus.textContent = "Please fill in both fields.";
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Get the user's Firestore profile
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      loginStatus.textContent = "Account not set up correctly.";
      return;
    }

    const role = userDoc.data().role;

    // Role-based redirect
    switch (role) {
      case "admin":
        window.location.href = "government.html";
        break;
      case "parent":
        window.location.href = "parent.html";
        break;
      case "student":
        window.location.href = "student.html";
        break;
      case "senior":
        window.location.href = "senior.html";
        break;
      case "vendor":
        window.location.href = "vendor.html";
        break;
      case "cardholder":
        window.location.href = "cardholder.html";
        break;
      default:
        loginStatus.textContent = "Invalid role. Please contact support.";
    }
  } catch (error) {
    console.error("Login error:", error);
    switch (error.code) {
      case "auth/user-disabled":
        loginStatus.textContent = "🚫 Your account has been suspended. Please contact support.";
        break;
      case "auth/user-not-found":
        loginStatus.textContent = "No user found with this email.";
        break;
      case "auth/wrong-password":
        loginStatus.textContent = "Incorrect password.";
        break;
      case "auth/invalid-email":
        loginStatus.textContent = "Invalid email format.";
        break;
      default:
        loginStatus.textContent = "Error: " + error.message;
    }
  }
});
