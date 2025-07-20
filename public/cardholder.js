// public/js/cardholder-login.js

const token = localStorage.getItem("boop_jwt");

const logoutBtn = document.getElementById("logoutBtn");
const cardholderNameEl = document.getElementById("cardholderName");
const cardholderEmailEl = document.getElementById("cardholderEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const transactionBody = document.getElementById("transactionBody");
const sendReceiveButtons = document.getElementById("sendReceiveButtons");
const errorDisplay = document.getElementById("errorMessage");

if (!token) {
  showError("No token found. Not redirecting for now.");
}

function decodeJWT(token) {
  const payload = token.split('.')[1];
  const decoded = atob(payload);
  return JSON.parse(decoded);
}

(async () => {
  try {
    const userRes = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const user = await userRes.json();

    if (!userRes.ok) {
      showError("⚠️ Could not fetch profile.");
      return;
    }

if (user.force_signed_out) {
  showError("⚠️ You’ve been signed out by admin.");
  setTimeout(() => {
    localStorage.clear();
    window.location.href = "cardholder-login.html";
  }, 2000); // wait 2 seconds so the message is visible
}

    // 🔓 Decode token to extract exp + id
    const decoded = decodeJWT(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString(); // convert exp to ISO
    const userId = decoded.id;

    // 📨 Record session with full data
    try {
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          user_id: userId,
          jwt_token: token,
          expires_at: expiresAt,
          status: "online"
        })
      });

      const sessionResult = await sessionRes.json();
      console.log("📬 Session record response:", sessionResult);
    } catch (sessionErr) {
      console.error("❌ Failed to record session:", sessionErr);
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
    showError("Unable to fetch your profile.");
  }
})();

// ⏱ Force logout checker
setInterval(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const user = await res.json();

    if (!res.ok) {
      showError("⚠️ Session invalid.");
      return;
    }

    if (user.force_signed_out) {
      showError("⚠️ You’ve been signed out by admin.");
    }
  } catch (err) {
    console.error("🔁 Polling error:", err);
    showError("Session check failed.");
  }
}, 10000);

function showError(msg) {
  const el = errorDisplay || document.getElementById("errorMessage");
  if (el) el.textContent = msg;
  console.warn("⚠️", msg);
}

logoutBtn?.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
});
