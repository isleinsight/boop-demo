// Logout functionality
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault(); // Prevent default link behavior
      firebase.auth().signOut()
        .then(() => {
          console.log("User signed out");
          window.location.href = "index.html"; // Redirect to homepage
        })
        .catch((error) => {
          console.error("Sign out error:", error);
        });
    });
  }
});

//////////////////////////////
Step 1 Connect to Wallet (MetaMask)
/////////////////////////////

// Wait for the DOM to fully load before attaching events
document.addEventListener("DOMContentLoaded", () => {
  // Grab the connect button from the HTML (make sure you have a button with this ID)
  const connectButton = document.getElementById("connectWallet");

  // When the button is clicked, run connectWallet()
  connectButton.addEventListener("click", connectWallet);
});

checkIfWalletConnected(); // Run this when the page loads
getBMDXBalance(); // Fetch token balance after connecting
checkForDailyReset(); // Reset daily spend if it's a new day

// This will hold the user's Ethereum address once connected
let userAddress = null;

// This function connects to MetaMask or another Ethereum provider
async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    alert("Please install MetaMask to use this feature.");
    return;
  }

  try {
    // Request access to the user's wallet
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

    // Save the address
    userAddress = accounts[0];

    // Display the address somewhere on your page
    document.getElementById("walletAddress").textContent = `Connected: ${userAddress}`;

    console.log("Wallet connected:", userAddress);
  } catch (error) {
    console.error("Connection error:", error);
    alert("Connection to wallet failed.");
  }
}



//////////////////////////////
// Step 2 Automatically Check & Display Wallet Address
/////////////////////////////

// Check if wallet is already connected when the page loads
async function checkIfWalletConnected() {
  if (typeof window.ethereum === "undefined") {
    console.warn("MetaMask not found.");
    return;
  }

  try {
    // Ask MetaMask for any connected accounts
    const accounts = await window.ethereum.request({ method: "eth_accounts" });

    if (accounts.length > 0) {
      // Set the user's address and update the UI
      userAddress = accounts[0];
      document.getElementById("walletAddress").textContent = `Connected: ${userAddress}`;
      console.log("Already connected:", userAddress);
    } else {
      console.log("No wallet connected yet.");
    }
  } catch (error) {
    console.error("Error checking wallet connection:", error);
  }
}


//////////////////////////////
// Step 3: Check BMDX Token Balance
/////////////////////////////
// Your smart contract address (replace this with your deployed BMDX address)
const bmdxAddress = "0xd9145CCE52D386f254917e481eB44e9943F39138";

// ABI (Application Binary Interface) for your BMDX ERC-20 token
const bmdxABI = [
  // Only include the functions you need — here, we only need 'balanceOf'
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  }
];

// Function to get the user's BMDX token balance
async function getBMDXBalance() {
  if (!userAddress || typeof window.ethereum === "undefined") {
    console.warn("Wallet not connected or MetaMask missing.");
    return;
  }

  try {
    // Connect to the blockchain using ethers.js
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const contract = new ethers.Contract(bmdxAddress, bmdxABI, provider);

    // Call the balanceOf function
    const rawBalance = await contract.balanceOf(userAddress);

    // Convert balance from Wei (smallest unit) to readable format (assuming 18 decimals)
    const formatted = ethers.utils.formatUnits(rawBalance, 18);

    // Show the balance on the page
    document.getElementById("bmdxBalance").textContent = `Balance: ${formatted} BMDX`;
    console.log("BMDX Balance:", formatted);
  } catch (error) {
    console.error("Error getting BMDX balance:", error);
  }
}


//////////////////////////////
// Step 4: Send BMDX Tokens (transfer)
/////////////////////////////
// Extended ABI to include 'transfer' function
bmdxABI.push({
  "constant": false,
  "inputs": [
    { "name": "_to", "type": "address" },
    { "name": "_value", "type": "uint256" }
  ],
  "name": "transfer",
  "outputs": [{ "name": "", "type": "bool" }],
  "type": "function"
});

// Function to send BMDX tokens to another address
async function sendBMDX(recipientAddress, amount) {
  if (!userAddress || typeof window.ethereum === "undefined") {
    alert("Wallet not connected or MetaMask not available.");
    return;
  }

  try {
    // Convert amount to smallest unit (Wei)
    const value = ethers.utils.parseUnits(amount, 18);

    // Setup blockchain connection
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const contract = new ethers.Contract(bmdxAddress, bmdxABI, signer);

    // Send the transaction
    const tx = await contract.transfer(recipientAddress, value);
    console.log("Transaction sent. Waiting for confirmation...", tx.hash);

    await tx.wait();
    alert(`✅ Sent ${amount} BMDX to ${recipientAddress}`);
    getBMDXBalance(); // Update balance after sending

  } catch (error) {
    console.error("❌ Error sending BMDX:", error);
    alert("Error: " + error.message);
  }
}


//////////////////////////////
// Step 5: User Role Logic (e.g. student rides free)
/////////////////////////////
// Simulate the current user's role (can be dynamic later)
let userRole = "student"; // Options: "student", "senior", "vendor", etc.

// Function to boop the bus
async function boopBusRide() {
  if (!userAddress) {
    alert("Please connect your wallet first.");
    return;
  }

  if (userRole === "student" || userRole === "senior") {
    alert(`✅ ${userRole.charAt(0).toUpperCase() + userRole.slice(1)} rides for free!`);
    // Log the ride, maybe send a zero-token transfer for recordkeeping
    return;
  }

  // For others, deduct 2 BMDX for a bus ride
  try {
    const fareAmount = "2"; // Example fare
    const busWallet = "0x1234567890abcdef1234567890abcdef12345678"; // Replace with real one
    await sendBMDX(busWallet, fareAmount);
  } catch (err) {
    console.error("Fare payment failed", err);
  }
}

//////////////////////////////
// Step 6: Role-Based Spending Limits
/////////////////////////////
// Role-based spending limits (daily limit in BMDX)
const spendingLimits = {
  student: 10,
  senior: 30,
  parent: 50,
  vendor: 0, // Vendors don’t send, they receive
  general: 100
};

// Keep track of what each wallet has spent today (simulated for now)
let userSpendingToday = 0;

// Helper to check if user can spend this amount
function canSpend(amount) {
  const limit = spendingLimits[userRole] || spendingLimits["general"];
  return userSpendingToday + parseFloat(amount) <= limit;
}

// Modified sendBMDX with spending check
async function sendBMDXWithLimit(recipientAddress, amount) {
  if (!userAddress || typeof window.ethereum === "undefined") {
    alert("Wallet not connected or MetaMask not available.");
    return;
  }

  if (!canSpend(amount)) {
    alert(`❌ Spending limit exceeded. You can only spend ${spendingLimits[userRole]} BMDX per day.`);
    return;
  }

  try {
    const value = ethers.utils.parseUnits(amount, 18);
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const contract = new ethers.Contract(bmdxAddress, bmdxABI, signer);

    const tx = await contract.transfer(recipientAddress, value);
    await tx.wait();

    userSpendingToday += parseFloat(amount); // Track the spend
    alert(`✅ Sent ${amount} BMDX to ${recipientAddress}. You’ve now spent ${userSpendingToday} BMDX today.`);
    getBMDXBalance(); // Update balance
  } catch (error) {
    console.error("Error sending BMDX:", error);
    alert("Transaction failed: " + error.message);
  }
}


//////////////////////////////
// Step 7: Create an Approved Vendor List
/////////////////////////////
// List of approved vendor addresses (case-insensitive)
const approvedVendors = [
  "0xAbC1234567890abcdef1234567890abcdef12345",
  "0x456def7890ABC1234567890abcdef1234567890aB"
];

// Helper to check if recipient is approved
function isApprovedVendor(address) {
  return approvedVendors.some(
    (vendor) => vendor.toLowerCase() === address.toLowerCase()
  );
}

// Final secure BMDX send function with all checks
async function secureBMDXTransfer(recipientAddress, amount) {
  if (!userAddress || typeof window.ethereum === "undefined") {
    alert("Wallet not connected or MetaMask not available.");
    return;
  }

  if (!isApprovedVendor(recipientAddress)) {
    alert("❌ This vendor is not approved for your card type.");
    return;
  }

  if (!canSpend(amount)) {
    alert(`❌ Spending limit exceeded. Your daily limit is ${spendingLimits[userRole]} BMDX.`);
    return;
  }

  try {
    const value = ethers.utils.parseUnits(amount, 18);
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const contract = new ethers.Contract(bmdxAddress, bmdxABI, signer);

    const tx = await contract.transfer(recipientAddress, value);
    await tx.wait();

    userSpendingToday += parseFloat(amount);
    alert(`✅ You sent ${amount} BMDX to an approved vendor.`); 
    logTransaction(recipientAddress, amount);
    getBMDXBalance(); // Update balance
  } catch (error) {
    console.error("Error sending BMDX:", error);
    alert("Transaction failed: " + error.message);
  }
}

//////////////////////////////
// Step 8: Transaction Logging
/////////////////////////////
// Store recent transactions in memory (could be saved to localStorage or backend later)
let transactionLog = [];

// Call this inside secureBMDXTransfer after a successful transfer
function logTransaction(to, amount) {
  const timestamp = new Date().toLocaleString();
  const logEntry = {
    to,
    amount,
    timestamp
  };
  transactionLog.unshift(logEntry); // Newest at top
  updateTransactionDisplay();
}

// Display the transaction history on the page
function updateTransactionDisplay() {
  const logContainer = document.getElementById("transaction-log");
  if (!logContainer) return;

  logContainer.innerHTML = ""; // Clear it

  transactionLog.forEach((tx, index) => {
    const item = document.createElement("li");
    item.textContent = `🟢 Sent ${tx.amount} BMDX to ${tx.to} on ${tx.timestamp}`;
    logContainer.appendChild(item);
  });
}



//////////////////////////////
// Step 9: Automatically Reset Daily Spending
/////////////////////////////
// Store the last transaction date
let lastTransactionDate = null;

// Check if today is a new day — if so, reset spending
function checkForDailyReset() {
  const today = new Date().toLocaleDateString(); // e.g., "5/30/2025"

  if (lastTransactionDate !== today) {
    console.log("🔄 New day detected. Resetting daily spend.");
    userSpendingToday = 0;
    lastTransactionDate = today;
  }
}


//////////////////////////////
// Step 10: Add Support for QR Codes or Smart Card “Boops”
/////////////////////////////
function simulateBoop(recipientAddress, amount) {
  if (!signer || !bmdxContract) {
    alert("Wallet not connected.");
    return;
  }

  // Pretend a card or QR code was scanned
  alert(`📡 Boop received for ${amount} BMDX to ${recipientAddress}`);
  secureBMDXTransfer(recipientAddress, amount);
}



//////////////////////////////
// Step 11: Add Senior Discount Logic
/////////////////////////////
// 🧓 Approved vendors offering senior discounts
const seniorVendors = [
  "0xVendorAddress1...",
  "0xVendorAddress2..."
];

// ✅ Days when seniors get discounts (0 = Sunday, 1 = Monday, etc.)
const seniorDiscountDays = [2, 4]; // e.g. Tuesday (2), Thursday (4)

// 💸 How much discount (e.g., 10%)
const seniorDiscountRate = 0.10;


function applySeniorDiscountIfEligible(senderAddress, recipientAddress, originalAmount, isSenior) {
  const today = new Date().getDay(); // e.g. 2 = Tuesday

  if (
    isSenior &&
    seniorVendors.includes(recipientAddress) &&
    seniorDiscountDays.includes(today)
  ) {
    const discountAmount = originalAmount * seniorDiscountRate;
    const discounted = originalAmount - discountAmount;

    console.log(`✅ Senior discount applied: -${discountAmount} BMDX`);
    return discounted;
  }

  return originalAmount;
}

async function secureBMDXTransfer(recipientAddress, amount, isSenior = false) {
  checkForDailyReset();

  const senderAddress = await signer.getAddress();

  // ✅ Apply senior discount if eligible
  const finalAmount = applySeniorDiscountIfEligible(senderAddress, recipientAddress, amount, isSenior);

  try {
    const tx = await bmdxContract.transfer(recipientAddress, ethers.utils.parseUnits(finalAmount.toString(), 18));
    await tx.wait();
    console.log(`✅ Sent ${finalAmount} BMDX to ${recipientAddress}`);
    userSpendingToday += finalAmount;
  } catch (error) {
    console.error("🚫 Transaction failed", error);
    alert("Transaction failed.");
  }
}





//////////////////////////////
// Step 12: Role-Based Purchase Restrictions
/////////////////////////////
// 🛒 Vendor categories mapped to addresses
const vendors = {
  groceries: ["0xVendorGroceries1...", "0xVendorGroceries2..."],
  snacks: ["0xVendorSnacks1...", "0xVendorSnacks2..."],
  alcohol: ["0xVendorLiquor1...", "0xVendorLiquor2..."],
  books: ["0xVendorBooks1..."]
};

// 👥 Define what each role is allowed to buy
const rolePermissions = {
  student: ["groceries", "snacks", "books"],
  senior: ["groceries", "snacks", "books", "alcohol"],
  general: ["groceries", "snacks", "books", "alcohol"]
};


function getVendorCategory(recipientAddress) {
  for (let category in vendors) {
    if (vendors[category].includes(recipientAddress)) {
      return category;
    }
  }
  return null; // Not recognized
}


function isTransactionAllowed(userRole, vendorCategory) {
  if (!userRole || !vendorCategory) return false;
  return rolePermissions[userRole].includes(vendorCategory);
}

async function secureBMDXTransfer(recipientAddress, amount, isSenior = false, userRole = "general") {
  checkForDailyReset();
  const senderAddress = await signer.getAddress();

  const vendorCategory = getVendorCategory(recipientAddress);

  // 🚫 Check if the user can buy from this vendor
  if (!isTransactionAllowed(userRole, vendorCategory)) {
    alert(`🚫 You are not allowed to purchase from this type of vendor (${vendorCategory}).`);
    return;
  }

  // ✅ Apply senior discount if eligible
  const finalAmount = applySeniorDiscountIfEligible(senderAddress, recipientAddress, amount, isSenior);

  try {
    const tx = await bmdxContract.transfer(recipientAddress, ethers.utils.parseUnits(finalAmount.toString(), 18));
    await tx.wait();
    console.log(`✅ Sent ${finalAmount} BMDX to ${recipientAddress}`);
    userSpendingToday += finalAmount;
  } catch (error) {
    console.error("🚫 Transaction failed", error);
    alert("Transaction failed.");
  }
}






//////////////////////////////
// Step 13: Display Recent Transactions 
/////////////////////////////
// 🧾 Initialize an empty array to store recent transactions
let transactionLog = [];

/**
 * 📝 Function: logTransaction
 * Logs a transaction in a readable format and stores it in the local transactionLog array.
 * 
 * @param {string} from - Sender's wallet address
 * @param {string} to - Recipient's wallet address
 * @param {number} amount - Amount of BMDX transferred
 * @param {string} category - Category of transaction (e.g. "Groceries", "Transport")
 * @param {boolean} success - Whether the transaction succeeded
 */
function logTransaction(from, to, amount, category = "General", success = true) {
  const now = new Date();
  const timestamp = now.toLocaleString();

  const txRecord = {
    from,
    to,
    amount,
    category,
    success,
    timestamp
  };

  // Add to the top of the log
  transactionLog.unshift(txRecord);

  // Keep only the latest 10 transactions
  if (transactionLog.length > 10) {
    transactionLog.pop();
  }

  // Display the log on the page
  displayTransactionLog();
}

/**
 * 📋 Function: displayTransactionLog
 * Renders the transaction log to the HTML page if a container exists.
 */
function displayTransactionLog() {
  const container = document.getElementById("transaction-log");
  if (!container) return; // Do nothing if there's no log section on the page

  // Clear current list
  container.innerHTML = "";

  // Create entries
  transactionLog.forEach((tx, index) => {
    const entry = document.createElement("div");
    entry.classList.add("log-entry");
    entry.innerHTML = `
      <strong>${tx.success ? "✅ Success" : "❌ Failed"}</strong> - ${tx.amount} BMDX<br/>
      From: ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}<br/>
      To: ${tx.to.slice(0, 6)}...${tx.to.slice(-4)}<br/>
      Category: ${tx.category}<br/>
      <small>${tx.timestamp}</small>
    `;
    container.appendChild(entry);
  });
}





//////////////////////////////
// Step 14 – Spending Limits
/////////////////////////////
// 🛑 Spending Limits (per address)
const spendingLimits = {
  // Example structure: "0xABC...": { dailyLimit: 20, spentToday: 5, lastReset: "YYYY-MM-DD" }
};

// 📅 Utility: Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

/**
 * 💳 Function: canSpendAmount
 * Checks if a user has not exceeded their daily spending limit.
 * 
 * @param {string} address - User's wallet address
 * @param {number} amount - Amount the user wants to spend
 * @returns {boolean} - True if allowed, false if over the limit
 */
function canSpendAmount(address, amount) {
  const today = getTodayDate();

  if (!spendingLimits[address]) {
    // No limits set for this address
    return true;
  }

  const record = spendingLimits[address];

  // Reset spentToday if it's a new day
  if (record.lastReset !== today) {
    record.spentToday = 0;
    record.lastReset = today;
  }

  const remaining = record.dailyLimit - record.spentToday;
  return amount <= remaining;
}

/**
 * 💾 Function: updateSpending
 * Updates the amount a user has spent today.
 * 
 * @param {string} address - User's wallet address
 * @param {number} amount - Amount just spent
 */
function updateSpending(address, amount) {
  const today = getTodayDate();

  if (!spendingLimits[address]) {
    // Skip if not being tracked
    return;
  }

  if (spendingLimits[address].lastReset !== today) {
    spendingLimits[address].spentToday = 0;
    spendingLimits[address].lastReset = today;
  }

  spendingLimits[address].spentToday += amount;
}

// 🧪 OPTIONAL: Example of setting a limit manually
// spendingLimits["0x123...abc"] = { dailyLimit: 30, spentToday: 0, lastReset: getTodayDate() };

// ✅ Integration Tip:
// Inside your transfer logic (like `secureBMDXTransfer`), insert something like:

// if (!canSpendAmount(senderAddress, finalAmount)) {
//   alert("You've reached your daily spending limit.");
//   return;
// }
// updateSpending(senderAddress, finalAmount);



//////////////////////////////
// Step 15 – Role-Based Alerts
/////////////////////////////
// 🧠 Simulated user role database
const userRoles = {
  // Example:
  // "0x123...": { role: "student", parent: "0xabc...", name: "Kenny", alertEnabled: true }
};

// 🔔 Role-based Alert Handler
function sendRoleBasedAlert(userAddress, eventType, amount = 0) {
  const user = userRoles[userAddress];
  if (!user || !user.alertEnabled) return;

  const today = getTodayDate();
  let message = "";

  switch (eventType) {
    case "overspend":
      message = `🚨 ALERT: ${user.name} tried to spend more than their daily limit on ${today}.`;
      break;
    case "successful-spend":
      message = `✅ ${user.name} successfully spent $${amount} on ${today}.`;
      break;
    case "denied-spend":
      message = `⛔ ${user.name} attempted a denied transaction of $${amount} on ${today}.`;
      break;
    default:
      message = `🔔 Activity by ${user.name} on ${today}: ${eventType}`;
  }

  // Simulate alert (replace with push/email/etc. in future)
  console.log(`[Parent Alert for ${user.parent}]: ${message}`);
  // You can also update a UI element or store the message in a log if needed
}

// 🧪 Example: Assign a student role to a wallet
userRoles["0x123456789abcdef"] = {
  role: "student",
  name: "Malik",
  parent: "0xParentWalletABC",
  alertEnabled: true
};

// ✅ Usage tip:
// After checking if a user overspent, trigger the alert like this:

/*
if (!canSpendAmount(senderAddress, finalAmount)) {
  sendRoleBasedAlert(senderAddress, "overspend", finalAmount);
  alert("You’ve reached your daily spending limit.");
  return;
} else {
  sendRoleBasedAlert(senderAddress, "successful-spend", finalAmount);
}
*/



//////////////////////////////
// Step 16 – Discount Eligibility Based on Day of the Week
/////////////////////////////
// 📅 Utility: Get current day of the week (0 = Sunday, 6 = Saturday)
function getDayOfWeek() {
  const today = new Date();
  return today.getDay(); 
}

// 🎯 Define role-based day discounts
const dayDiscountRules = {
  senior: {
    // 2 = Tuesday, 4 = Thursday
    allowedDays: [2, 4],
    discountPercent: 20
  },
  student: {
    allowedDays: [1, 2, 3, 4, 5], // Weekdays
    discountPercent: 0 // already free for transport
  },
  parent: {
    allowedDays: [1, 2, 3, 4, 5, 6], // Optional example
    discountPercent: 5
  }
  // Add more roles as needed
};

// 🎯 Check if today's discount is valid for the user
function isDiscountDay(userAddress) {
  const user = userRoles[userAddress];
  if (!user) return false;

  const rule = dayDiscountRules[user.role];
  if (!rule) return false;

  const today = getDayOfWeek();
  return rule.allowedDays.includes(today);
}

// 🎯 Get today's discount percent (if valid), otherwise return 0
function getDiscountPercent(userAddress) {
  if (isDiscountDay(userAddress)) {
    const role = userRoles[userAddress].role;
    return dayDiscountRules[role].discountPercent;
  }
  return 0;
}

// 💰 Apply discount inside your secure transfer logic:
function applyDayBasedDiscount(userAddress, originalAmount) {
  const discountPercent = getDiscountPercent(userAddress);
  if (discountPercent > 0) {
    const discountedAmount = originalAmount - (originalAmount * discountPercent) / 100;
    console.log(`🎉 ${discountPercent}% discount applied. Final amount: ${discountedAmount}`);
    return discountedAmount;
  }
  return originalAmount;
}

/* ✅ Example usage inside transfer logic:

let finalAmount = applyDayBasedDiscount(senderAddress, originalAmount);
secureBMDXTransfer(senderAddress, recipientAddress, finalAmount);
*/




//////////////////////////////
// Step 17 – Show Transaction History on the Page
/////////////////////////////
// 🧠 1. Save the transaction to localStorage (for demo purposes only)
function saveTransactionLocally(transaction) {
  let history = JSON.parse(localStorage.getItem("boopHistory")) || [];
  history.push(transaction);
  localStorage.setItem("boopHistory", JSON.stringify(history));
}

// 🧠 2. Display the transaction history on the page
function displayTransactionHistory() {
  const historySection = document.getElementById("transaction-history");
  historySection.innerHTML = ""; // Clear it first

  const history = JSON.parse(localStorage.getItem("boopHistory")) || [];

  if (history.length === 0) {
    historySection.innerHTML = "<p>No transactions yet.</p>";
    return;
  }

  // Create a table
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  // Table header
  const headerRow = document.createElement("tr");
  ["From", "To", "Amount", "Category", "Approved", "Date"].forEach((heading) => {
    const th = document.createElement("th");
    th.textContent = heading;
    th.style.borderBottom = "1px solid #ccc";
    th.style.padding = "8px";
    table.appendChild(headerRow);
    headerRow.appendChild(th);
  });

  // Table rows
  history.forEach((tx) => {
    const row = document.createElement("tr");
    ["from", "to", "amount", "category", "approved", "timestamp"].forEach((key) => {
      const td = document.createElement("td");
      td.textContent = tx[key];
      td.style.padding = "6px";
      td.style.borderBottom = "1px solid #eee";
      row.appendChild(td);
    });
    table.appendChild(row);
  });

  historySection.appendChild(table);
}

// ✨ 3. Update your logTransaction function to include local logging:
function logTransaction(from, to, amount, category, approved) {
  const tx = {
    from,
    to,
    amount,
    category,
    approved,
    timestamp: new Date().toLocaleString()
  };
  console.log("🧾 Transaction logged:", tx);
  saveTransactionLocally(tx); // Save locally
  displayTransactionHistory(); // Update the page
}

// 📦 4. On page load, show the history if any
document.addEventListener("DOMContentLoaded", () => {
  displayTransactionHistory();
});



//////////////////////////////
// STEP 18 – USER FEEDBACK & MESSAGING SYSTEM
/////////////////////////////

// This creates a message box on the page to show helpful feedback to users,
// like success messages, errors, or instructions.

// 1. Function to display messages to the user
function showMessage(message, type = "info") {
  const box = document.getElementById("message-box");
  box.textContent = message;

  // Color based on message type
  if (type === "error") {
    box.style.color = "#ff4d4f"; // red
  } else if (type === "success") {
    box.style.color = "#38a169"; // green
  } else {
    box.style.color = "#2d3748"; // default/dark gray
  }
}

// 2. Call showMessage() inside your wallet functions to provide live feedback

// --- Wallet connection ---
async function connectWallet() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      currentAccount = accounts[0];
      document.getElementById("wallet-address").textContent = currentAccount;
      showMessage("✅ Wallet connected!", "success");
    } catch (error) {
      console.error("Wallet connection failed", error);
      showMessage("❌ Failed to connect wallet: " + error.message, "error");
    }
  } else {
    showMessage("❌ MetaMask not detected. Please install MetaMask.", "error");
  }
}

// --- Secure transfer ---
async function secureBMDXTransfer(senderAddress, recipientAddress, amount, vendorCategory) {
  if (!bmdxContract) {
    showMessage("Contract not loaded. Please connect your wallet first.", "error");
    return;
  }

  try {
    // Optional limit logic can go here (from Step 14)
    const finalAmount = ethers.utils.parseUnits(amount.toString(), 18);
    const tx = await bmdxContract.transfer(recipientAddress, finalAmount);
    await tx.wait();

    // Log it (Step 13)
    logTransaction(senderAddress, recipientAddress, finalAmount, vendorCategory, true);

    showMessage(`✅ Sent ${amount} BMDX to ${recipientAddress}`, "success");
  } catch (error) {
    console.error("Transfer failed", error);
    showMessage("❌ Transaction failed: " + error.message, "error");
  }
}





//////////////////////////////
// Step 19 – Real-Time BMDX Balance Checker
/////////////////////////////
// STEP 19 – REAL-TIME BMDX BALANCE CHECKER
// This step adds a function to fetch and display the user's BMDX token balance.
// It should run after the wallet is connected and anytime the balance might change.

// 1. Function to fetch and display balance
async function updateBMDXBalance() {
  if (!bmdxContract || !currentAccount) {
    showMessage("Wallet not connected or contract missing.", "error");
    return;
  }

  try {
    const balance = await bmdxContract.balanceOf(currentAccount);
    const formatted = ethers.utils.formatUnits(balance, 18);

    document.getElementById("bmdx-balance").textContent = `${formatted} BMDX`;
  } catch (error) {
    console.error("Error fetching balance:", error);
    showMessage("❌ Failed to fetch BMDX balance", "error");
  }
}

// 2. Modify your wallet connection function to call this too

async function connectWallet() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      currentAccount = accounts[0];
      document.getElementById("wallet-address").textContent = currentAccount;
      showMessage("✅ Wallet connected!", "success");

      await updateBMDXBalance(); // ✅ Fetch balance after connecting
    } catch (error) {
      console.error("Wallet connection failed", error);
      showMessage("❌ Failed to connect wallet: " + error.message, "error");
    }
  } else {
    showMessage("❌ MetaMask not detected. Please install MetaMask.", "error");
  }
}

// 3. OPTIONAL: Update balance after a successful transfer
// (Already done if you're using secureBMDXTransfer from Step 18)




//////////////////////////////
// Step 20 – Vendor Whitelist System
/////////////////////////////
// STEP 20 – VENDOR WHITELIST SYSTEM
// This step prevents sending BMDX to vendors that aren't approved (on the whitelist).

// 1. Define a whitelist of approved vendor addresses.
// In a real app, this list would come from a backend or smart contract call.
const approvedVendors = [
  "0x1234567890abcdef1234567890abcdef12345678", // Example Grocery Store
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", // Example Pharmacy
  // Add real or test addresses here as needed
];

// 2. Utility function to check if a vendor is approved
function isVendorWhitelisted(address) {
  return approvedVendors.includes(address.toLowerCase());
}

// 3. Modify the secureBMDXTransfer function to include this check
async function secureBMDXTransfer(recipientAddress, amount, vendorCategory) {
  if (!bmdxContract || !currentAccount) {
    showMessage("❌ Wallet or contract not available.", "error");
    return;
  }

  if (!ethers.utils.isAddress(recipientAddress)) {
    showMessage("❌ Invalid recipient address.", "error");
    return;
  }

  if (!isVendorWhitelisted(recipientAddress)) {
    showMessage("❌ Vendor not approved. Transaction blocked.", "error");
    return;
  }

  try {
    const amountInWei = ethers.utils.parseUnits(amount.toString(), 18);
    const tx = await bmdxContract.transfer(recipientAddress, amountInWei);
    await tx.wait();
    showMessage(`✅ Sent ${amount} BMDX to ${recipientAddress}`, "success");

    logTransaction(currentAccount, recipientAddress, amount, vendorCategory, true);

    await updateBMDXBalance(); // Update balance after sending
  } catch (error) {
    console.error("Transfer failed:", error);
    showMessage("❌ Transfer failed", "error");

    logTransaction(currentAccount, recipientAddress, amount, vendorCategory, false);
  }
}





//////////////////////////////
// Step 21: Offline Fallback Detection
//////////////////////////////


// Check for MetaMask and connection status
function detectWalletAvailability() {
  const walletStatus = document.getElementById("wallet-status");

  if (typeof window.ethereum === 'undefined') {
    console.warn("MetaMask is not installed!");
    if (walletStatus) {
      walletStatus.textContent = "🛑 MetaMask not detected. Please install MetaMask.";
      walletStatus.style.color = "red";
    }
    return false;
  }

  if (!window.ethereum.isConnected()) {
    console.warn("MetaMask detected, but not connected.");
    if (walletStatus) {
      walletStatus.textContent = "⚠️ MetaMask not connected.";
      walletStatus.style.color = "orange";
    }
    return false;
  }

  // If connected
  if (walletStatus) {
    walletStatus.textContent = "✅ Wallet ready.";
    walletStatus.style.color = "green";
  }
  return true;
}

// Listen for changes in the network or wallet account
function monitorWalletEvents() {
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      console.log("Accounts changed:", accounts);
      checkIfWalletConnected(); // Refresh the connected wallet address
    });

    window.ethereum.on("chainChanged", (chainId) => {
      console.log("Network changed to:", chainId);
      window.location.reload(); // Reload the page when network changes
    });
  }
}

// Add a status box to your HTML dynamically (or you can hardcode one in your HTML)
window.addEventListener("DOMContentLoaded", () => {
  const statusDiv = document.createElement("div");
  statusDiv.id = "wallet-status";
  statusDiv.style.fontSize = "0.9em";
  statusDiv.style.padding = "10px";
  statusDiv.style.marginTop = "10px";
  statusDiv.style.textAlign = "center";
  document.body.prepend(statusDiv);

  detectWalletAvailability();
  monitorWalletEvents();
});





//////////////////////////////
// STEP 22 – QR CODE GENERATION FOR VENDOR CHECKOUT
//////////////////////////////


// Function to generate a QR code based on vendor address and amount
function generateVendorQRCode(vendorAddress, amountInEth, label = "BOOP Payment") {
  const qrContainer = document.getElementById("qr-code-container");
  if (!qrContainer) {
    console.error("Missing #qr-code-container in HTML!");
    return;
  }

  // Clear any previous QR code
  qrContainer.innerHTML = "";

  // Compose the payment string (e.g., ethereum:0x123...?value=1.0)
  const uri = `ethereum:${vendorAddress}?value=${amountInEth}&label=${encodeURIComponent(label)}`;

  // Use QRCode.js to generate the image
  new QRCode(qrContainer, {
    text: uri,
    width: 180,
    height: 180,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  console.log("QR Code generated:", uri);
}





//////////////////////////////
// STEP 23 – SCAN A QR CODE AND PAY AUTOMATICALLY
//////////////////////////////
// <script src="https://unpkg.com/html5-qrcode@2.3.9"></script>

// Function to initialize QR scanner and process scanned data
function startQrScanAndPay() {
  const qrRegionId = "qr-reader"; 
  const html5QrCode = new Html5Qrcode(qrRegionId);

  const qrConfig = {
    fps: 10,
    qrbox: 250
  };

  // This function runs when a QR code is successfully scanned
  function onScanSuccess(decodedText, decodedResult) {
    console.log("Scanned QR Code:", decodedText);
    
    // Stop scanning after success
    html5QrCode.stop().then(() => {
      console.log("Scanner stopped");

      // Parse the URI from QR Code
      const url = new URL(decodedText);
      const recipient = url.pathname.replace(/^\/+/, ""); // remove leading slashes
      const params = new URLSearchParams(url.search);
      const value = params.get("value");
      const label = params.get("label") || "BOOP Transaction";

      // Call the sendTransaction function (you already have this in your script)
      sendTransaction(recipient, value)
        .then(() => alert(`Sent ${value} ETH to ${recipient} (${label})`))
        .catch(err => {
          console.error("Transaction failed", err);
          alert("Failed to send transaction.");
        });
    }).catch(err => {
      console.error("Failed to stop scanner", err);
    });
  }

  // Handle any errors during scan
  function onScanError(errorMessage) {
    // Can be used to show scan errors or log
    console.warn("Scan error:", errorMessage);
  }

  // Start the camera and begin scanning
  Html5Qrcode.getCameras().then(cameras => {
    if (cameras && cameras.length) {
      const cameraId = cameras[0].id;
      html5QrCode.start(cameraId, qrConfig, onScanSuccess, onScanError);
    } else {
      console.error("No camera found!");
      alert("No camera found to scan QR code.");
    }
  }).catch(err => {
    console.error("Camera access error:", err);
    alert("Camera access denied or unavailable.");
  });
}





//////////////////////////////
// STEP 24 – GENERATE A QR CODE FOR A PAYMENT REQUEST
//////////////////////////////


// Load this library in your HTML later when you're ready:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

/**
 * Generates a QR code that can be scanned to send crypto payments
 * @param {string} vendorAddress - The vendor's wallet address (e.g., 0xabc...)
 * @param {string} amount - Amount to request in ETH or token format
 * @param {string} label - Optional label (e.g., "Café Latte")
 */
function generatePaymentQrCode(vendorAddress, amount = "", label = "") {
  // Format the Ethereum payment URL
  const url = `ethereum:${vendorAddress}?value=${amount}&label=${encodeURIComponent(label)}`;

  // Define the target div where QR will appear
  const qrTarget = document.getElementById("qr-code");

  // Clear anything previously inside it
  qrTarget.innerHTML = "";

  // Generate the new QR code
  new QRCode(qrTarget, {
    text: url,
    width: 250,
    height: 250,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  console.log("QR Code generated:", url);
}





//////////////////////////////
// STEP 25 – Vendor Dashboard: Manage QR Profiles
//////////////////////////////


/**
 * Save a QR code profile to localStorage
 * @param {string} profileName - A user-friendly name like "Lunch Combo"
 * @param {string} address - The wallet address to receive payment
 * @param {string} amount - The amount to request
 * @param {string} label - Optional label/description
 */
function saveQrProfile(profileName, address, amount, label) {
  const profile = { address, amount, label };

  // Retrieve existing profiles
  const profiles = JSON.parse(localStorage.getItem("qrProfiles")) || {};

  // Save new/updated one
  profiles[profileName] = profile;

  // Store back to localStorage
  localStorage.setItem("qrProfiles", JSON.stringify(profiles));

  console.log(`Saved profile '${profileName}'`);
}

/**
 * Load all saved QR profiles from localStorage
 * @returns {Object} All profiles as an object
 */
function loadQrProfiles() {
  return JSON.parse(localStorage.getItem("qrProfiles")) || {};
}

/**
 * Display QR profiles as buttons or list in the dashboard
 * @param {string} containerId - The ID of the HTML element to display them in
 */
function renderQrProfiles(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  const profiles = loadQrProfiles();
  for (const name in profiles) {
    const profile = profiles[name];
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.onclick = () => {
      generatePaymentQrCode(profile.address, profile.amount, profile.label);
    };
    container.appendChild(btn);
  }
}

/**
 * Delete a profile by name
 * @param {string} profileName - Name of the profile to delete
 */
function deleteQrProfile(profileName) {
  const profiles = loadQrProfiles();
  if (profiles[profileName]) {
    delete profiles[profileName];
    localStorage.setItem("qrProfiles", JSON.stringify(profiles));
    console.log(`Deleted profile '${profileName}'`);
  }
}





//////////////////////////////
// STEP 25 – Vendor Dashboard: Manage QR Profiles
//////////////////////////////


/**
 * Save a QR code profile to localStorage
 * @param {string} profileName - A user-friendly name like "Lunch Combo"
 * @param {string} address - The wallet address to receive payment
 * @param {string} amount - The amount to request
 * @param {string} label - Optional label/description
 */
function saveQrProfile(profileName, address, amount, label) {
  const profile = { address, amount, label };

  // Retrieve existing profiles
  const profiles = JSON.parse(localStorage.getItem("qrProfiles")) || {};

  // Save new/updated one
  profiles[profileName] = profile;

  // Store back to localStorage
  localStorage.setItem("qrProfiles", JSON.stringify(profiles));

  console.log(`Saved profile '${profileName}'`);
}

/**
 * Load all saved QR profiles from localStorage
 * @returns {Object} All profiles as an object
 */
function loadQrProfiles() {
  return JSON.parse(localStorage.getItem("qrProfiles")) || {};
}

/**
 * Display QR profiles as buttons or list in the dashboard
 * @param {string} containerId - The ID of the HTML element to display them in
 */
function renderQrProfiles(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  const profiles = loadQrProfiles();
  for (const name in profiles) {
    const profile = profiles[name];
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.onclick = () => {
      generatePaymentQrCode(profile.address, profile.amount, profile.label);
    };
    container.appendChild(btn);
  }
}

/**
 * Delete a profile by name
 * @param {string} profileName - Name of the profile to delete
 */
function deleteQrProfile(profileName) {
  const profiles = loadQrProfiles();
  if (profiles[profileName]) {
    delete profiles[profileName];
    localStorage.setItem("qrProfiles", JSON.stringify(profiles));
    console.log(`Deleted profile '${profileName}'`);
  }
}





/**************************************
 * STEP 26: Parent to Child Wallet Transfer
 * - Simulates a parent account topping up a child’s wallet.
 * - You could use this logic to allow oversight or restrictions.
 **************************************/

// Sample structure to track parent-child wallets
const parentToChildMap = {
  '0xParentAddress1': '0xChildAddress1',
  '0xParentAddress2': '0xChildAddress2',
  // Add more mappings as needed
};

// Simulated child balances for display
const childBalances = {
  '0xChildAddress1': 0,
  '0xChildAddress2': 0,
  // You can populate this during testing
};

// Function for parent to top-up child wallet
async function parentTopUpChild(parentAddress, amount, vendorRestriction = []) {
  const childAddress = parentToChildMap[parentAddress];
  if (!childAddress) {
    console.log("No child linked to this parent wallet.");
    return;
  }

  // Simulate transfer to child’s wallet
  try {
    const tx = await contractInstance.methods.transfer(childAddress, amount).send({ from: parentAddress });
    console.log(`Top-up successful: ${amount} BMDX sent to ${childAddress}`);

    // Optional: Update child balance tracking (for UI)
    childBalances[childAddress] = (childBalances[childAddress] || 0) + amount;

    // Optional: Log it (for admin view)
    logTransaction(parentAddress, childAddress, amount, vendorRestriction.join(', '), true);
  } catch (error) {
    console.error("Top-up failed:", error);
  }
}


/**************************************************
 * STEP 27: Local Transaction Logging and Viewing
 * - Logs transactions in localStorage for now
 * - Later, this can be replaced with backend API
 **************************************************/

// Function to log a transaction (called after each transfer)
function logTransaction(sender, recipient, amount, vendorCategory = 'general', success = true) {
  const transaction = {
    sender,
    recipient,
    amount,
    vendorCategory,
    success,
    timestamp: new Date().toISOString(),
  };

  // Get existing history from localStorage
  let history = JSON.parse(localStorage.getItem('transactionHistory')) || [];

  // Add new transaction to the beginning of the list
  history.unshift(transaction);

  // Save updated history
  localStorage.setItem('transactionHistory', JSON.stringify(history));
}

// Function to get transaction history
function getTransactionHistory() {
  const history = JSON.parse(localStorage.getItem('transactionHistory')) || [];
  return history;
}

// Function to display history (you’ll link this to a page or button later)
function showTransactionHistory() {
  const history = getTransactionHistory();

  if (history.length === 0) {
    console.log("No transactions found.");
    return;
  }

  console.log("Transaction History:");
  history.forEach((tx, index) => {
    console.log(`${index + 1}. ${tx.timestamp}`);
    console.log(`   From: ${tx.sender}`);
    console.log(`   To: ${tx.recipient}`);
    console.log(`   Amount: ${tx.amount} BMDX`);
    console.log(`   Category: ${tx.vendorCategory}`);
    console.log(`   Success: ${tx.success}`);
    console.log('---------------------------');
  });
}




/***********************************************
 * STEP 28: Vendor-Side Purchase Verification
 * - Vendors use this logic to check:
 *   a) If a customer has enough BMDX
 *   b) If the transaction is allowed (e.g. not blocked)
 *   c) Then process the purchase
 ***********************************************/

// Simulated list of approved vendors (by category or wallet address)
const approvedVendors = {
  '0xVendorWallet1': 'groceries',
  '0xVendorWallet2': 'snacks',
  '0xVendorWallet3': 'school-supplies',
  // You can add more
};

// Simulated restriction list for children (optional feature)
const restrictedVendorCategories = {
  '0xChildAddress1': ['groceries', 'snacks'],
  '0xChildAddress2': ['school-supplies'],
};

// Function to simulate purchase processing at vendor
async function processPurchase(customerAddress, vendorAddress, amount) {
  // Check if the vendor is approved
  const vendorCategory = approvedVendors[vendorAddress];
  if (!vendorCategory) {
    console.log("This vendor is not approved.");
    return;
  }

  // Optional: Check if customer is a child with spending restrictions
  const restrictedCategories = restrictedVendorCategories[customerAddress];
  if (restrictedCategories && !restrictedCategories.includes(vendorCategory)) {
    console.log("Purchase not allowed for this customer at this vendor.");
    return;
  }

  // Check customer balance
  const balance = await contractInstance.methods.balanceOf(customerAddress).call();
  if (parseInt(balance) < amount) {
    console.log("Insufficient BMDX balance.");
    return;
  }

  // Transfer BMDX to vendor
  try {
    const tx = await contractInstance.methods.transfer(vendorAddress, amount).send({ from: customerAddress });
    console.log(`Purchase of ${amount} BMDX sent to ${vendorAddress} from ${customerAddress}`);

    // Optional: Log purchase
    logTransaction(customerAddress, vendorAddress, amount, vendorCategory, true);
  } catch (error) {
    console.error("Transaction failed:", error);
  }
}





/*******************************************************
 * STEP 28: Role Detection Based on Wallet Address
 * - This is a simulation using predefined test addresses.
 * - Later, roles will come from blockchain or database.
 *******************************************************/

// Sample role list — this should be securely stored in reality
const userRoles = {
  "0x1111111111111111111111111111111111111111": "student",
  "0x2222222222222222222222222222222222222222": "parent",
  "0x3333333333333333333333333333333333333333": "senior",
  "0x4444444444444444444444444444444444444444": "vendor",
  "0x5555555555555555555555555555555555555555": "admin"
};

// Detect current user role by address
function detectUserRole(address) {
  const normalized = address.toLowerCase();
  const role = userRoles[normalized] || "guest";
  console.log(`Detected role for ${address}: ${role}`);
  return role;
}

// Example usage: Automatically detect when wallet connects
async function handleUserRoleDetection() {
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  const address = accounts[0];
  const role = detectUserRole(address);

  // Optionally update the UI or restrict features
  if (role === "student") {
    console.log("Student perks enabled");
    // Example: Automatically skip fare deduction
  } else if (role === "vendor") {
    console.log("Vendor interface enabled");
  } else if (role === "guest") {
    console.log("No specific role assigned.");
  }

  // Save role for other parts of the app if needed
  localStorage.setItem("userRole", role);
}




/*******************************************************
 * STEP 29: Developer Mode – Simulate Roles Manually
 * - Lets you override wallet detection for testing
 * - Useful for switching roles without reconnecting wallets
 *******************************************************/

// Enable this flag during development
const developerMode = true;

// Developer-defined role (overrides real detection)
let simulatedRole = "student"; // Change to: parent, senior, vendor, admin

// Unified role getter that respects developer mode
function getUserRole(address) {
  if (developerMode) {
    console.warn(`Developer mode ON – Simulating role: ${simulatedRole}`);
    return simulatedRole;
  }

  return detectUserRole(address);
}

// Use this instead of calling detectUserRole directly
async function getCurrentUserRole() {
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  const address = accounts[0];
  const role = getUserRole(address);

  // Store role for UI or access control logic
  localStorage.setItem("userRole", role);
  console.log(`User role set as: ${role}`);

  return role;
}




/********************************************************
 * STEP 30: Developer Console Overlay
 * - Shows wallet address, role, and current network
 * - Great for debugging on-page in dev mode
 ********************************************************/

function createDeveloperOverlay(address, role) {
  if (!developerMode) return; // Only show in dev mode

  const overlay = document.createElement("div");
  overlay.id = "developerOverlay";
  overlay.style.position = "fixed";
  overlay.style.bottom = "20px";
  overlay.style.right = "20px";
  overlay.style.backgroundColor = "#102a43";
  overlay.style.color = "white";
  overlay.style.padding = "15px";
  overlay.style.borderRadius = "10px";
  overlay.style.fontSize = "0.9em";
  overlay.style.zIndex = "9999";
  overlay.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
  overlay.style.fontFamily = "monospace";

  overlay.innerHTML = `
    <strong>🧪 Developer Mode</strong><br/>
    Wallet: ${address.slice(0, 6)}...${address.slice(-4)}<br/>
    Role: ${role}<br/>
    Network: Ethereum (Simulated)
  `;

  document.body.appendChild(overlay);
}

// Call this once wallet connects or role is determined
async function showOverlayAfterConnect() {
  if (!developerMode) return;
  
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  const address = accounts[0];
  const role = getUserRole(address);
  
  createDeveloperOverlay(address, role);
}

// Run this after DOM loads or wallet connects
window.addEventListener("load", () => {
  if (developerMode) {
    showOverlayAfterConnect();
  }
});




/********************************************************
 * STEP 31: Page Access Logging
 * Logs when a user opens a page, for auditing purposes
 ********************************************************/

function logPageVisit(pageName) {
  const userAddress = window.currentUserAddress || "unknown";
  const timestamp = new Date().toISOString();

  // You could also save this to an external logging service
  console.log(`[📄 Page Access Log] ${timestamp} – ${userAddress} visited ${pageName}`);

  // Optional: store in localStorage for demo/testing
  const history = JSON.parse(localStorage.getItem("pageVisitLog")) || [];
  history.push({ user: userAddress, page: pageName, time: timestamp });
  localStorage.setItem("pageVisitLog", JSON.stringify(history));
}

// Example: call this at the top of each page (or in a shared script)
window.addEventListener("load", () => {
  const currentPage = window.location.pathname.split("/").pop(); // e.g. "student.html"
  logPageVisit(currentPage);
});




/********************************************************
 * STEP 32: Display Wallet Balance
 * Show the user their current BMDX token balance in real time.
 ********************************************************/

// Function to fetch balance from the blockchain
async function getWalletBalance() {
  if (!window.currentUserAddress || !window.contract) {
    console.warn("Wallet address or contract not available yet.");
    return;
  }

  try {
    const balance = await window.contract.methods.balanceOf(window.currentUserAddress).call();
    const readableBalance = window.web3.utils.fromWei(balance, 'ether');

    // Update balance on the page (assuming an element with ID "wallet-balance")
    const balanceElement = document.getElementById("wallet-balance");
    if (balanceElement) {
      balanceElement.textContent = `Balance: ${readableBalance} BMDX`;
    }

    console.log(`[💰 Balance] ${window.currentUserAddress} has ${readableBalance} BMDX`);
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
  }
}

// Call this when the page loads
window.addEventListener("load", () => {
  setTimeout(getWalletBalance, 2000); // slight delay to ensure connection
});

// Also call it after any transfer or receive action
// For example, inside your `sendBMDX()` function, you can add:
// await getWalletBalance();



/********************************************************
 * STEP 33: Add Refresh Button to Check Wallet Balance
 * This allows users to click a button and instantly refresh
 * their displayed BMDX token balance.
 ********************************************************/

// Add event listener to refresh balance on click
document.addEventListener("DOMContentLoaded", function () {
  const refreshBtn = document.getElementById("refresh-balance");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing...";

      await getWalletBalance();

      refreshBtn.textContent = "Refresh Balance";
      refreshBtn.disabled = false;
    });
  }
});





/********************************************************
 * STEP 34: Error Message Display & Logging
 * Shows nice error messages to users and logs tech info
 * to the console so we can debug without confusing the user.
 ********************************************************/

// Display a user-friendly error message on the screen
function displayUserError(message) {
  let errorBox = document.getElementById("error-box");
  if (!errorBox) {
    errorBox = document.createElement("div");
    errorBox.id = "error-box";
    errorBox.style.color = "#D8000C";
    errorBox.style.backgroundColor = "#FFBABA";
    errorBox.style.padding = "12px";
    errorBox.style.margin = "20px 0";
    errorBox.style.borderRadius = "6px";
    errorBox.style.textAlign = "center";
    errorBox.style.fontWeight = "bold";
    document.body.insertBefore(errorBox, document.body.firstChild);
  }

  errorBox.textContent = message;

  // Automatically hide the error message after 7 seconds
  setTimeout(() => {
    if (errorBox) errorBox.remove();
  }, 7000);
}

// Use this to safely wrap async functions
async function safelyRun(fn) {
  try {
    await fn();
  } catch (error) {
    console.error("Something went wrong:", error); // Dev view
    displayUserError("Oops! Something went wrong. Please try again."); // User view
  }
}





/********************************************************
 * STEP 35: Admin Override Functions
 * These should only be available in a testing environment
 ********************************************************/

// Simulate adding balance for demo/testing
function adminAddBalance(targetAddress, amount) {
  if (!targetAddress || !amount) {
    displayUserError("Admin: Missing address or amount.");
    return;
  }

  console.log(`Admin adding ${amount} BMDX to ${targetAddress}`);
  // In real implementation, this would require smart contract access
  // For now, pretend success:
  alert(`Simulated: ${amount} BMDX added to ${targetAddress}`);
}

// Simulate resetting someone's balance
function adminResetBalance(targetAddress) {
  if (!targetAddress) {
    displayUserError("Admin: Missing address to reset.");
    return;
  }

  console.log(`Admin resetting balance for ${targetAddress}`);
  // Real reset would involve smart contract logic
  alert(`Simulated: Balance reset for ${targetAddress}`);
}






// ==============================
// STEP 36: Transaction Verifier
// ==============================

// Called when the user clicks "Verify" on proof.html
function verifyTransaction() {
  const input = document.getElementById('searchInput').value.trim();
  const resultDiv = document.getElementById('transactionResult');

  // Clear any previous result
  resultDiv.innerHTML = "";

  if (!input) {
    resultDiv.innerHTML = `<p style="color: red;">Please enter a transaction hash or wallet address.</p>`;
    return;
  }

  // Dummy blockchain-like result
  const mockResult = {
    txHash: "0x1234abcd5678ef901234abcd5678ef901234abcd5678ef901234abcd5678ef90",
    from: "0xabc123456789...",
    to: "0xdef987654321...",
    amount: "50 BMDX",
    vendor: "Island Grocery",
    timestamp: new Date().toLocaleString()
  };

  // Show results (this would come from a blockchain query in real usage)
  resultDiv.innerHTML = `
    <h3>Transaction Found</h3>
    <p><strong>Transaction Hash:</strong> ${mockResult.txHash}</p>
    <p><strong>Sender:</strong> ${mockResult.from}</p>
    <p><strong>Recipient:</strong> ${mockResult.to}</p>
    <p><strong>Amount:</strong> ${mockResult.amount}</p>
    <p><strong>Vendor:</strong> ${mockResult.vendor}</p>
    <p><strong>Timestamp:</strong> ${mockResult.timestamp}</p>
  `;
}











// ✅ TESTING ONLY: Simulate BOOP with or without senior status
function simulateBoop(recipientAddress, amount, isSenior = false) {
  if (!signer || !bmdxContract) {
    alert("Wallet not connected.");
    return;
  }

  alert(`📡 Boop received for ${amount} BMDX to ${recipientAddress}`);
  secureBMDXTransfer(recipientAddress, amount, isSenior);
}

// 👉 Example test cases:
simulateBoop("0xVendorAddress1...", 20);             // Normal user
simulateBoop("0xVendorAddress1...", 20, true);        // Senior on discount day
