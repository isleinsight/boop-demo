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

    if (res.status === 401) {
      // Force sign-out or invalid token
      console.warn("⛔ Unauthorized or force signed out");
      localStorage.clear();
      window.location.href = "cardholder-login.html";
      return;
    }

    const user = await res.json();

    if (user.force_signed_out) {
      console.warn("⛔ User has been force signed out");
      localStorage.clear();
      window.location.href = "cardholder-login.html";
      return;
    }

    // 👇 Your existing logic continues here...
    // e.g. populate UI, fetch wallet, etc.

  } catch (err) {
    console.error("🔥 Error fetching user info:", err);
    localStorage.clear();
    window.location.href = "cardholder-login.html";
  }
})();

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
    console.error("🚫 Session invalid:", err);
    redirectToLogin();
  }
})();

// 🔁 Auto-logout if force_signed_out is triggered mid-session
setInterval(async () => {
  try {
    const res = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Unauthorized");

    const user = await res.json();
    if (user.force_signed_out) {
      console.warn("🛑 Mid-session force logout");
      redirectToLogin();
    }
  } catch (err) {
    redirectToLogin();
  }
}, 10000); // Check every 10 seconds

function redirectToLogin() {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
}

logoutBtn?.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "cardholder-login.html";
});
