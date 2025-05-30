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
Automatically Check & Display Wallet Address
/////////////////////////////


//////////////////////////////
Automatically Check & Display Wallet Address
/////////////////////////////


//////////////////////////////
Automatically Check & Display Wallet Address
/////////////////////////////


//////////////////////////////
Automatically Check & Display Wallet Address
/////////////////////////////



//////////////////////////////
Automatically Check & Display Wallet Address
/////////////////////////////



//////////////////////////////
Automatically Check & Display Wallet Address
/////////////////////////////





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
