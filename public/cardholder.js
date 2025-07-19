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

(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const user = await res.json();

    if (!res.ok) {
      showError("⚠️ Could not fetch profile.");
      console.warn("⛔ Invalid response from /api/me:", res.status);
      return;
    }

    if (user.force_signed_out) {
      showError("⚠️ You’ve been signed out by admin.");
      return;
    }

    const decoded = parseJwt(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();
    const userId = user.id || decoded.userId || decoded.id;

    // 🔥 POST session record
    try {
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          status: "online",
          jwt_token: token,
          expires_at: expiresAt,
          user_id: userId
        })
      });

      const sessionData = await sessionRes.json();

      if (sessionRes.ok) {
        console.log("✅ Session recorded:", sessionData.message);
      } else {
        console.warn("⚠️ Failed to record session:", sessionData.message);
      }
    } catch (sessionErr) {
      console.error("❌ Session recording error:", sessionErr);
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
    showError("Unable to fetch your profile. Not redirecting.");
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
      console.warn("🔁 Polling failed:", res.status);
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

// 🔍 Decode JWT payload safely
function parseJwt(token) {
  try {
    const base64Payload = token.split(".")[1];
    const decodedPayload = atob(base64Payload);
    return JSON.parse(decodedPayload);
  } catch (err) {
    console.error("❌ Failed to decode token:", err);
    return {};
  }
}
