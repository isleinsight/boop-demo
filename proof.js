// Firebase v10 Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc
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
const db = getFirestore(app);

// Helper to get URL query params
function getTransactionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// Render transaction proof
async function renderTransactionProof() {
  const id = getTransactionIdFromUrl();
  if (!id) {
    document.getElementById("proofContent").innerHTML = "<p>❌ No transaction ID provided.</p>";
    return;
  }

  try {
    const docRef = doc(db, "transactions", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      document.getElementById("proofContent").innerHTML = "<p>❌ Transaction not found.</p>";
      return;
    }

    const tx = docSnap.data();
    const date = tx.timestamp?.toDate().toLocaleString() || "N/A";

    document.getElementById("proofContent").innerHTML = `
      <div class="proof-box">
        <h2>Transaction Proof</h2>
        <p><strong>Transaction ID:</strong> ${id}</p>
        <p><strong>From:</strong> ${tx.from}</p>
        <p><strong>To:</strong> ${tx.to}</p>
        <p><strong>Type:</strong> ${tx.type}</p>
        <p><strong>Amount:</strong> $${(tx.amount || 0).toFixed(2)}</p>
        <p><strong>Status:</strong> ${tx.status}</p>
        <p><strong>Date:</strong> ${date}</p>
      </div>
    `;
  } catch (err) {
    console.error("Failed to load transaction proof:", err);
    document.getElementById("proofContent").innerHTML = "<p>❌ Failed to load proof.</p>";
  }
}

document.addEventListener("DOMContentLoaded", renderTransactionProof);
