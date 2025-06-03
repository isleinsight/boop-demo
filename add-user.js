import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed",
  measurementId: "G-79DWYFPZNR"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Get form
const addUserForm = document.getElementById("addUserForm");
const statusMsg = document.getElementById("addUserStatus");

addUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  try {
    // Step 1: Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Step 2: Write user details to Firestore
    await setDoc(doc(db, "users", uid), {
      firstName,
      lastName,
      email,
      role,
      walletAddress: "", // Empty for now unless you want to generate it
      cardUID: "",        // Optional fields for expansion
      balance: 0,
      addedBy: auth.currentUser?.email || "Unknown"
    });

    statusMsg.style.color = "green";
    statusMsg.textContent = "User added successfully!";
    addUserForm.reset();
  } catch (error) {
    console.error("Error adding user:", error);
    statusMsg.style.color = "red";
    statusMsg.textContent = error.message;
  }
});
