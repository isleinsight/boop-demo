// Wait for the DOM to fully load before attaching events
document.addEventListener("DOMContentLoaded", () => {
  // Grab the connect button from the HTML (make sure you have a button with this ID)
  const connectButton = document.getElementById("connectWallet");

  // When the button is clicked, run connectWallet()
  connectButton.addEventListener("click", connectWallet);
});

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
