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
