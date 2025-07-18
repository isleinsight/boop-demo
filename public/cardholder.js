const token = localStorage.getItem("boop_jwt");

const logoutBtn = document.getElementById("logoutBtn");
const cardholderNameEl = document.getElementById("cardholderName");
const cardholderEmailEl = document.getElementById("cardholderEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const transactionBody = document.getElementById("transactionBody");
const sendReceiveButtons = document.getElementById("sendReceiveButtons");
const errorDisplay = document.getElementById("errorMessage"); // <-- Add this div in HTML

if (!token) {
  redirectToLogin();
}

(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const user = await res.json();

    if (!res.ok || user.force_signed_out) {
      showError("Session expired or access denied.");
      return;
    }

    cardholderNameEl.textContent = `${user.first_name || ""} ${user.last_name || ""}`;
    cardholderEmailEl.textContent = user.email || "-";

    const walletRes = await fetch(`/api/wallets/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const wallet = await walletRes.json();

    walletIdEl.textContent = wallet.id || "N/A";
    walletBalanceEl.textContent = `$${(wallet.balance || 0).toFixed(2)}`;

    const role = user.role?.toLowerCase();
    const showButtons = role === "vendor" || (role === "cardholder" && user.on_assistance !== true);
    sendReceiveButtons.classList.toggle("hidden", !showButtons);

    transactionBody.innerHTML = `<div class="activity-item">Activity loading not implemented yet.</div>`;

  } catch (err) {
    console.error("🔥 Error fetching user info:", err);
    showError("Unable to fetch your profile. Try reloading.");
  }
})();

// ⏱ Periodic check for force logout
setInterval(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const user = await res.json();
    if (!res.ok || user.force_signed_out) {
      showError("You've been signed out by an admin.");
    }
  } catch (err) {
    console.error("🔁 Polling error:", err);
    showError("Session check failed.");
  }
}, 10000);

function redirectToLogin() {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
}

function showError(msg) {
  const el = errorDisplay || document.getElementById("errorMessage");
  if (el) el.textContent = msg;
  console.warn("⚠️", msg);
}

logoutBtn?.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
});
