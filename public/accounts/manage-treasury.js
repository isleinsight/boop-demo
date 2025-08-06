document.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(localStorage.getItem("boopUser"));
  const token = localStorage.getItem("boop_jwt");

  const balanceDisplay = document.getElementById("balanceDisplay");
  const amountInput = document.getElementById("adjustAmount");
  const noteInput = document.getElementById("adjustNote");
  const typeSelect = document.getElementById("adjustType");
  const submitBtn = document.getElementById("submitAdjustment");
  const statusMessage = document.getElementById("statusMessage");

  if (!user || user.role !== "admin" || !["treasury", "accountant"].includes(user.type)) {
    alert("🚫 You do not have access to this page.");
    return (window.location.href = "login.html");
  }

  async function fetchBalance() {
    try {
      const res = await fetch("/api/treasury/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      const balanceCents = data.balance_cents || 0;
      const balanceDollars = (balanceCents / 100).toFixed(2);
      balanceDisplay.textContent = `$${balanceDollars}`;
    } catch (err) {
      console.error("❌ Failed to fetch balance:", err);
      balanceDisplay.textContent = "Error";
    }
  }

  async function fetchRecentTransactions() {
    try {
      const res = await fetch("/api/treasury/recent", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      const txContainer = document.querySelector(".transaction-placeholder");
      if (!Array.isArray(data) || data.length === 0) {
        txContainer.textContent = "No transactions yet.";
        return;
      }

      txContainer.innerHTML = "<strong>Recent Transactions:</strong><ul style='list-style:none;padding-left:0;'>";

      data.forEach(tx => {
        const dollars = (tx.amount_cents / 100).toFixed(2);
        const sign = tx.type === "credit" ? "+" : "-";
        const color = tx.type === "credit" ? "green" : "red";
        txContainer.innerHTML += `<li style="color:${color}">${sign}$${dollars} — ${tx.note}</li>`;
      });

      txContainer.innerHTML += "</ul>";
    } catch (err) {
      console.error("❌ Failed to fetch recent transactions:", err);
    }
  }

  async function submitAdjustment() {
    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim();
    const type = typeSelect.value;

    if (isNaN(amount) || amount <= 0) {
      return showStatus("Amount must be greater than zero.", "red");
    }

    if (!note) {
      return showStatus("Note is required.", "red");
    }

    const amountCents = Math.round(amount * 100);

    try {
      const res = await fetch("/api/treasury/adjust", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount_cents: amountCents, type, note }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Adjustment failed.");
      }

      showStatus("✅ Adjustment successful!", "green");
      amountInput.value = "";
      noteInput.value = "";
      await fetchBalance();
      await fetchRecentTransactions();

    } catch (err) {
      console.error("❌ Submit failed:", err);
      showStatus(err.message || "Unknown error occurred.", "red");
    }
  }

  function showStatus(message, color) {
    statusMessage.textContent = message;
    statusMessage.style.color = color;
  }

  submitBtn.addEventListener("click", submitAdjustment);

  fetchBalance();
  fetchRecentTransactions();
});
