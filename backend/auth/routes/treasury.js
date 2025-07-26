document.addEventListener("DOMContentLoaded", async () => {
  const balanceEl = document.getElementById("walletBalance");
  const adjustmentForm = document.getElementById("adjustmentForm");
  const amountInput = document.getElementById("adjustAmount");
  const noteInput = document.getElementById("adjustNote");

  const token = localStorage.getItem("boopToken");

  async function fetchCurrentUser() {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to fetch current user");
    return await res.json();
  }

  async function loadWalletBalance(walletId) {
    try {
      const res = await fetch(`/api/treasury/balance/${walletId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch balance");
      const data = await res.json();
      balanceEl.textContent = `$${parseFloat(data.balance || 0).toFixed(2)}`;
    } catch (err) {
      console.error("❌ Error loading balance:", err);
      balanceEl.textContent = "Error loading";
    }
  }

  async function adjustWallet(walletId, amount, note) {
    const res = await fetch("/api/treasury/adjust", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        wallet_id: walletId,
        amount: parseFloat(amount),
        note: note.trim()
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Adjustment failed");
    }
    return await res.json();
  }

  // 🔐 Auth & Load
  let user;
  try {
    user = await fetchCurrentUser();

    if (!user || user.role !== "admin" || user.type !== "treasury") {
      alert("Access denied");
      return window.location.href = "login.html";
    }

    const walletId = user.wallet_id;
    if (!walletId) throw new Error("Missing wallet ID");

    await loadWalletBalance(walletId);

    adjustmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = parseFloat(amountInput.value);
      const note = noteInput.value;

      if (!note || isNaN(amount) || amount === 0) {
        return alert("Enter a valid amount and note.");
      }

      try {
        const result = await adjustWallet(walletId, amount, note);
        alert("Adjustment successful.");
        amountInput.value = "";
        noteInput.value = "";
        await loadWalletBalance(walletId);
      } catch (err) {
        console.error("❌ Adjustment error:", err);
        alert(err.message);
      }
    });

  } catch (err) {
    console.error("❌ Error loading treasury page:", err);
    alert("There was a problem loading this page.");
    window.location.href = "login.html";
  }
});
