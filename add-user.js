import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Your Firebase config
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

const step1Form = document.getElementById("step1Form");
const step2Form = document.getElementById("step2Form");
const step1Status = document.getElementById("step1Status");
const step2Status = document.getElementById("step2Status");

let createdUserUID = null;

step1Form.addEventListener("submit", async (e) => {
  e.preventDefault();
  step1Status.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    createdUserUID = userCredential.user.uid;
    step1Status.textContent = "Step 1 successful! Please complete step 2.";
    step1Status.style.color = "green";

    // Disable first form and enable second
    document.getElementById("email").disabled = true;
    document.getElementById("password").disabled = true;
    step1Form.querySelector("button").disabled = true;
    step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = false);
  } catch (error) {
    console.error("Error in step 1:", error);
    step1Status.textContent = "Step 1 error: " + error.message;
    step1Status.style.color = "red";
  }
});

step2Form.addEventListener("submit", async (e) => {
  e.preventDefault();
  step2Status.textContent = "";

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const role = document.getElementById("role").value;
  const walletAddress = document.getElementById("walletAddress").value.trim();
  const addedBy = auth.currentUser ? auth.currentUser.email : "unknown";  // ← changed here

  if (!createdUserUID) {
    step2Status.textContent = "User ID not found. Please complete Step 1 first.";
    step2Status.style.color = "red";
    return;
  }

  try {
    await setDoc(doc(db, "users", createdUserUID), {
      firstName,
      lastName,
      role,
      walletAddress,
      addedBy
    });

    step2Status.textContent = "User successfully added!";
    step2Status.style.color = "green";

    step2Form.reset();
    createdUserUID = null;
  } catch (error) {
    console.error("Error in step 2:", error);
    step2Status.textContent = "Step 2 error: " + error.message;
    step2Status.style.color = "red";
  }
});



import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const auth = getAuth();

const logoutButton = document.getElementById("logoutBtn");

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      console.log("User signed out.");
      window.location.href = "index.html"; // Redirect to homepage after logout
    } catch (error) {
      console.error("Logout error:", error);
      alert("Logout failed. Please try again.");
    }
  });
}




