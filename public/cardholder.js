const token = localStorage.getItem("boop_jwt");
const user = JSON.parse(localStorage.getItem("boopUser"));

const logoutBtn = document.getElementById("logoutBtn");
const cardholderNameEl = document.getElementById("cardholderName");
const cardholderEmailEl = document.getElementById("cardholderEmail");
const walletIdEl = document.getElementById("walletId");
const walletBalanceEl = document.getElementById("walletBalance");
const transactionBody = document.getElementById("transactionBody");
const sendReceiveButtons = document.getElementById("sendReceiveButtons");
const errorDisplay = document.getElementById("errorMessage");

// 🚪 Boot unauthorized users
const allowedRoles = ["cardholder", "student", "senior"];
if (!user || !allowedRoles.includes(user.role?.toLowerCase())) {
  window.location.href = "cardholder-login.html";
}

if (!token) {
  forceRedirect("No token found. Please log in again.");
}

(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const currentUser = await res.json();

    if (!res.ok || !currentUser.email) {
      forceRedirect("⚠️ Session invalid or expired.");
      return;
    }

    if (currentUser.force_signed_out) {
      forceRedirect("⚠️ You’ve been signed out by admin.");
      return;
    }

    // 🧾 Display user info
    cardholderNameEl.textContent = `${currentUser.first_name || ""} ${currentUser.last_name || ""}`;
    cardholderEmailEl.textContent = currentUser.email || "-";

    const walletRes = await fetch(`/api/wallets/${currentUser.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const wallet = await walletRes.json();
    walletIdEl.textContent = wallet.id || "N/A";
    walletBalanceEl.textContent = `$${(wallet.balance || 0).toFixed(2)}`;

    const role = currentUser.role?.toLowerCase();
    const showButtons = role === "vendor" || (role === "cardholder" && currentUser.on_assistance !== true);
    sendReceiveButtons.classList.toggle("hidden", !showButtons);

    transactionBody.innerHTML = `<div class="activity-item">Activity loading not implemented yet.</div>`;

  } catch (err) {
    console.error("🔥 Error fetching user info:", err);
    forceRedirect("Unable to fetch your profile.");
  }
})();

// 🕵️‍♂️ Background session checker
setInterval(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const currentUser = await res.json();
    if (!res.ok || !currentUser.email || currentUser.force_signed_out) {
      forceRedirect("⚠️ You’ve been logged out.");
    }
  } catch (err) {
    forceRedirect("⚠️ Session check failed.");
  }
}, 10000);

// 💥 Force redirect + message
function forceRedirect(msg) {
  showError(msg);
  setTimeout(() => {
    localStorage.clear();
    window.location.href = "cardholder-login.html";
  }, 1500);
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
