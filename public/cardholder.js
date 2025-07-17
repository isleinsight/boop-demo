const token = localStorage.getItem("boop_jwt");

const logoutBtn = document.getElementById("logoutBtn");
const cardholderNameEl = document.getElementById("cardholderName");
const cardholderEmailEl = document.getElementById("cardholderEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const transactionBody = document.getElementById("transactionBody");
const sendReceiveButtons = document.getElementById("sendReceiveButtons");

// 🔐 Redirect if no token
if (!token) {
  window.location.href = "cardholder-login.html";
}

// 🔐 Fetch user info
(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      localStorage.clear();
      window.location.href = "cardholder-login.html";
      return;
    }

    const user = await res.json();

    cardholderNameEl.textContent = `${user.first_name || ""} ${user.last_name || ""}`;
    cardholderEmailEl.textContent = user.email || "-";

    // 🔁 Fetch wallet details
    const walletRes = await fetch(`/api/wallets/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const wallet = await walletRes.json();
    walletIdEl.textContent = wallet.id || "N/A";
    walletBalanceEl.textContent = `$${(wallet.balance || 0).toFixed(2)}`;

    // 🎛️ Role-based button visibility
    const role = user.role?.toLowerCase();
    const showButtons = role === "vendor" || (role === "cardholder" && user.on_assistance !== true);
    sendReceiveButtons.classList.toggle("hidden", !showButtons);

    // 📄 Load activity (placeholder)
    transactionBody.innerHTML = `<div class="activity-item">Activity loading not implemented yet.</div>`;

  } catch (err) {
    console.error("Failed to load cardholder data:", err);
    transactionBody.innerHTML = `<div class="activity-item">Error loading data.</div>`;
  }
})();

// 🔌 Logout
logoutBtn?.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
});
