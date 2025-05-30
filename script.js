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
Step 2 Automatically Check & Display Wallet Address
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
Step 3: Check BMDX Token Balance
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
