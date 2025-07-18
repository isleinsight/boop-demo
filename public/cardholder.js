const token = localStorage.getItem("boop_jwt");

const logoutBtn = document.getElementById("logoutBtn");
const cardholderNameEl = document.getElementById("cardholderName");
const cardholderEmailEl = document.getElementById("cardholderEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const transactionBody = document.getElementById("transactionBody");
const sendReceiveButtons = document.getElementById("sendReceiveButtons");

if (!token) {
  redirectToLogin();
}

// 🔐 Fetch user info and check force_signed_out
(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Unauthorized");

    const user = await res.json();

    if (user.force_signed_out) {
      console.warn("⛔ User has been force signed out (initial)");
      redirectToLogin();
      return;
    }

    // ✅ Render UI
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
    redirectToLogin();
  }
})();

// 🔁 Auto-check every 10s for force_signed_out mid-session
setInterval(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Unauthorized");

    const user = await res.json();
    if (user.force_signed_out) {
      console.warn("🛑 Mid-session force logout triggered");
      redirectToLogin();
    }
  } catch (err) {
    console.error("🔁 Polling error:", err);
    redirectToLogin();
  }
}, 10000);

function redirectToLogin() {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
}

logoutBtn?.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
});
