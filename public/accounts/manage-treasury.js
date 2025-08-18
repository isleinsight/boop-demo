document.addEventListener("DOMContentLoaded", () => {
  console.log("[MT] DOM ready");
  const user  = JSON.parse(localStorage.getItem("boopUser"));
  const token = localStorage.getItem("boop_jwt");

  // ---- Permission: admin + treasury (no accountant)
  if (!user || user.role !== "admin" || user.type !== "treasury") {
    console.warn("[MT] Forbidden for this user", user);
    alert("🚫 You do not have access to this page.");
    window.location.href = "login.html";
    return;
  }

  // ---- DOM
  const balanceDisplay = document.getElementById("balanceDisplay");
  const amountInput    = document.getElementById("adjustAmount");
  const noteInput      = document.getElementById("adjustNote");
  const typeSelect     = document.getElementById("adjustType");
  const submitBtn      = document.getElementById("submitAdjustment");
  const statusMessage  = document.getElementById("statusMessage");

  if (!balanceDisplay || !amountInput || !noteInput || !typeSelect || !submitBtn || !statusMessage) {
    console.error("[MT] Missing required DOM nodes", {
      balanceDisplay: !!balanceDisplay, amountInput: !!amountInput, noteInput: !!noteInput,
      typeSelect: !!typeSelect, submitBtn: !!submitBtn, statusMessage: !!statusMessage
    });
    return;
  }

  // Create/attach a wallet selector if the HTML doesn’t already have one
  let walletSelect = document.getElementById("walletSelect");
  if (!walletSelect) {
    walletSelect = document.createElement("select");
    walletSelect.id = "walletSelect";
    walletSelect.style.margin = "8px 0 14px";
    walletSelect.style.padding = "8px 10px";
    walletSelect.style.border = "1px solid #e6ebf1";
    walletSelect.style.borderRadius = "8px";

    const label = document.createElement("label");
    label.textContent = "Source Treasury";
    label.style.display = "block";
    label.style.fontSize = ".95rem";
    label.style.color = "#334155";

    // Put the selector inside the card, just above the Amount field
    const host   = document.querySelector(".container-small") || document.body;
    const marker = document.querySelector('label[for="adjustAmount"]');
    if (host && marker) {
      host.insertBefore(label, marker);
      host.insertBefore(walletSelect, marker);
    } else {
      host.prepend(walletSelect);
      host.prepend(label);
    }
  }

  // ---- State
  let wallets = [];
  let currentWalletId = null;

  // ---- Helpers
  const auth = { Authorization: `Bearer ${token}` };
  const dollars = c => `$${(Number(c || 0) / 100).toFixed(2)}`;
  const showStatus = (msg, color = "") => {
    statusMessage.textContent = msg;
    statusMessage.style.color = color;
  };

  // ---- API wrappers (with graceful fallback)
  async function getTreasuryWallets() {
    console.log("[MT] GET /api/treasury/treasury-wallets");
    const r = await fetch("/api/treasury/treasury-wallets", { headers: auth });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || "Failed to load treasuries");
    return j;
  }

  async function getBalance(walletId) {
    console.log("[MT] GET balance for", walletId);
    let r = await fetch(`/api/treasury/wallet/${walletId}/balance`, { headers: auth });
    if (r.status === 404) {
      r = await fetch(`/api/treasury/balance?wallet_id=${encodeURIComponent(walletId)}`, { headers: auth });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || "Failed to load balance");
    return j;
  }

  async function getRecent(walletId) {
    console.log("[MT] GET recent for", walletId);
    let r = await fetch(`/api/treasury/wallet/${walletId}/recent`, { headers: auth });
    if (r.status === 404) {
      r = await fetch(`/api/treasury/recent?wallet_id=${encodeURIComponent(walletId)}`, { headers: auth });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || "Failed to load recent");
    return j;
  }

  async function postAdjust(walletId, payload) {
    console.log("[MT] POST adjust", walletId, payload);
    // Prefer wallet-scoped endpoint; fall back to generic and include wallet_id in body
    let r = await fetch(`/api/treasury/wallet/${walletId}/adjust`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.status === 404) {
      r = await fetch(`/api/treasury/adjust`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, wallet_id: walletId }),
      });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || "Adjustment failed");
    return j;
  }

  // ---- UI fills
  function fillWalletSelect() {
    console.log("[MT] fillWalletSelect", wallets);
    if (!Array.isArray(wallets) || wallets.length === 0) {
      walletSelect.innerHTML = `<option value="">No treasury wallets found</option>`;
      currentWalletId = null;
      return;
    }
    walletSelect.innerHTML = wallets
      .map(w => `<option value="${w.id}">${w.name || w.label || `Wallet ${w.id}`}</option>`)
      .join("");
    currentWalletId = wallets[0].id;
    walletSelect.value = currentWalletId;
    // subtle hint to user if there are multiple choices
    walletSelect.title = "Choose which treasury wallet to adjust";
  }

  async function refreshBalance() {
    if (!currentWalletId) { balanceDisplay.textContent = "$0.00"; return; }
    try {
      const { balance_cents = 0 } = await getBalance(currentWalletId);
      balanceDisplay.textContent = dollars(balance_cents);
    } catch (e) {
      console.error("[MT] balance error", e);
      balanceDisplay.textContent = "Error";
      showStatus(e.message, "red");
    }
  }

  async function refreshRecent() {
    const box = document.querySelector(".transaction-placeholder");
    if (!box) return;
    if (!currentWalletId) { box.textContent = "No wallet selected."; return; }

    box.textContent = "Loading...";
    try {
      const data = await getRecent(currentWalletId);
      if (!Array.isArray(data) || !data.length) {
        box.textContent = "No transactions yet.";
        return;
      }
      box.innerHTML = "<strong>Recent Transactions:</strong><ul style='list-style:none;padding-left:0;margin-top:6px;'>";
      data.forEach(tx => {
        const sign = (tx.type || "").toLowerCase() === "credit" ? "+" : "-";
        const color = sign === "+" ? "green" : "red";
        const amt = dollars(Math.abs(Number(tx.amount_cents || 0)));
        box.innerHTML += `<li style="color:${color}">${sign}${amt} — ${tx.note || tx.description || ""}</li>`;
      });
      box.innerHTML += "</ul>";
    } catch (e) {
      console.error("[MT] recent error", e);
      box.textContent = "Failed to load transactions.";
      showStatus(e.message, "red");
    }
  }

  // ---- Events
  walletSelect.addEventListener("change", async (e) => {
    currentWalletId = e.target.value || null;
    console.log("[MT] wallet changed ->", currentWalletId);
    await refreshBalance();
    await refreshRecent();
  });

  submitBtn.addEventListener("click", async () => {
    console.log("[MT] submit clicked");
    const amount = parseFloat(amountInput.value);
    const note   = noteInput.value.trim();
    const type   = typeSelect.value; // "credit" or "debit"

    if (!currentWalletId) { showStatus("Select a treasury wallet first.", "red"); walletSelect.focus(); return; }
    if (isNaN(amount) || amount <= 0) { showStatus("Amount must be greater than zero.", "red"); amountInput.focus(); return; }
    if (!note) { showStatus("Note is required.", "red"); noteInput.focus(); return; }

    try {
      showStatus("Submitting…");
      await postAdjust(currentWalletId, { amount_cents: Math.round(amount * 100), type, note });
      showStatus("✅ Adjustment successful!", "green");
      amountInput.value = "";
      noteInput.value = "";
      await refreshBalance();
      await refreshRecent();
    } catch (e) {
      console.error("[MT] submit error", e);
      showStatus(e.message || "Unknown error.", "red");
    }
  });

  // ---- Boot
  (async function init() {
    try {
      console.log("[MT] init start");
      wallets = await getTreasuryWallets(); // each: { id, name/label }
      if (!Array.isArray(wallets) || !wallets.length) throw new Error("No treasury wallets configured.");
      fillWalletSelect();
      await refreshBalance();
      await refreshRecent();
      console.log("[MT] init done");
    } catch (e) {
      console.error("[MT] init error", e);
      showStatus(e.message || "Failed to initialize.", "red");
    }
  })(); // end init
}); // end DOMContentLoaded
