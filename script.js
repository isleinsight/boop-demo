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
