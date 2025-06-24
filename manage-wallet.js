// Firebase v10 imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Config
const firebaseConfig = {
  apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
  authDomain: "boop-becff.firebaseapp.com",
  projectId: "boop-becff",
  storageBucket: "boop-becff.appspot.com",
  messagingSenderId: "570567453336",
  appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const logoutBtn = document.getElementById("logoutBtn");
const userSelect = document.getElementById("userSelect");
const walletIdDisplay = document.getElementById("walletIdDisplay");
const assignWalletBtn = document.getElementById("assignWalletBtn");
const addBusCardBtn = document.getElementById("addBusCardBtn");
const addSpendingCardBtn = document.getElementById("addSpendingCardBtn");
const cardList = document.getElementById("cardList");

// Session auth
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadUsers();
});

logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => (window.location.href = "index.html"));
});

// Load users into dropdown
async function loadUsers() {
  userSelect.innerHTML = '<option value="">-- Select user --</option>';
  const usersSnapshot = await getDocs(collection(db, "users"));
  usersSnapshot.forEach(doc => {
    const user = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = `${user.firstName} ${user.lastName} (${user.role})`;
    userSelect.appendChild(opt);
  });
}

// On user select
userSelect.addEventListener("change", async () => {
  const userId = userSelect.value;
  if (!userId) return;
  await showWalletInfo(userId);
});

// Show wallet + cards
async function showWalletInfo(userId) {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return;

  const userData = userDoc.data();
  const walletId = userData.walletId || null;

  if (walletId) {
    walletIdDisplay.textContent = `Wallet ID: ${walletId}`;
    loadCards(walletId);
  } else {
    walletIdDisplay.textContent = `No wallet assigned.`;
    cardList.innerHTML = "";
  }
}

// Assign wallet
assignWalletBtn.addEventListener("click", async () => {
  const userId = userSelect.value;
  if (!userId) return alert("Select a user.");

  const newWalletId = `wallet_${Date.now()}`;
  await updateDoc(doc(db, "users", userId), { walletId: newWalletId });

  walletIdDisplay.textContent = `Wallet ID: ${newWalletId}`;
  cardList.innerHTML = "";
  alert("Wallet assigned.");
});

// Add card
addBusCardBtn.addEventListener("click", () => addCard("bus"));
addSpendingCardBtn.addEventListener("click", () => addCard("spending"));

async function addCard(type) {
  const userId = userSelect.value;
  if (!userId) return alert("Select a user.");

  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return alert("User not found.");

  const walletId = userDoc.data().walletId;
  if (!walletId) return alert("Assign wallet first.");

  const newCard = {
    walletId,
    userId,
    cardType: type,
    cardId: `card_${type}_${Date.now()}`,
    status: "active",
    issuedAt: serverTimestamp()
  };

  await addDoc(collection(db, "cards"), newCard);
  alert(`${type.charAt(0).toUpperCase() + type.slice(1)} card added.`);
  loadCards(walletId);
}

// Load cards for wallet
async function loadCards(walletId) {
  cardList.innerHTML = "Loading...";
  const cardsSnap = await getDocs(query(collection(db, "cards")));
  let html = "";

  cardsSnap.forEach((doc) => {
    const c = doc.data();
    if (c.walletId === walletId) {
      html += `<li>${c.cardType.toUpperCase()} – ${c.cardId}</li>`;
    }
  });

  cardList.innerHTML = html || "No cards assigned.";
}