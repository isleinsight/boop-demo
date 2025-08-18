document.addEventListener("DOMContentLoaded", () => {
  const user  = JSON.parse(localStorage.getItem("boopUser"));
  const token = localStorage.getItem("boop_jwt");

  // ---- Permission: admin + (treasury|accountant)
  if (!user || user.role !== "admin" || !["treasury","accountant"].includes(user.type)) {
    alert("🚫 You do not have access to this page.");
    return (window.location.href = "login.html");
  }

  // ---- DOM
  const balanceDisplay = document.getElementById("balanceDisplay");
  const amountInput    = document.getElementById("adjustAmount");
  const noteInput      = document.getElementById("adjustNote");
  const typeSelect     = document.getElementById("adjustType");
  const submitBtn      = document.getElementById("submitAdjustment");
  const statusMessage  = document.getElementById("statusMessage");

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
    const host = document.querySelector(".balance-row") || document.body;
    host.prepend(walletSelect);
    host.prepend(label);
  }

  // ---- State
  let wallets = [];
  let currentWalletId = null;

  // ---- Helpers
  const auth = { Authorization: `Bearer ${token}` };
  const dollars = c => `$${(Number(c||0)/100).toFixed(2)}`;
  const showStatus = (msg, color="") => { statusMessage.textContent = msg; statusMessage.style.color = color; };

  // ---- API wrappers (with graceful fallback)
  async function getTreasuryWallets() {
    const r = await fetch("/api/treasury/treasury-wallets", { headers: auth });
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).message || "Failed to load treasuries");
    return r.json();
  }
  async function getBalance(walletId) {
    // Prefer wallet-scoped endpoint; fall back to generic with query
    let r = await fetch(`/api/treasury/wallet/${walletId}/balance`, { headers: auth });
    if (r.status === 404) r = await fetch(`/api/treasury/balance?wallet_id=${encodeURIComponent(walletId)}`, { headers: auth });
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).message || "Failed to load balance");
    return r.json();
  }
  async function getRecent(walletId) {
    let r = await fetch(`/api/treasury/wallet/${walletId}/recent`, { headers: auth });
    if (r.status === 404) r = await fetch(`/api/treasury/recent?wallet_id=${encodeURIComponent(walletId)}`, { headers: auth });
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).message || "Failed to load recent");
    return r.json();
  }
  async function postAdjust(walletId, payload) {
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
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.message || "Adjustment failed");
    return j;
  }

  // ---- UI fills
  function fillWalletSelect() {
    walletSelect.innerHTML = wallets
      .map(w => `<option value="${w.id}">${(w.name || w.label || `Wallet ${w.id}`)}</option>`)
      .join("");
    if (wallets.length) currentWalletId = wallets[0].id;
  }
  async function refreshBalance() {
    if (!currentWalletId) return;
    try {
      const { balance_cents = 0 } = await getBalance(currentWalletId);
      balanceDisplay.textContent = dollars(balance_cents);
    } catch (e) {
      console.error(e); balanceDisplay.textContent = "Error"; showStatus(e.message, "red");
    }
  }
  async function refreshRecent() {
    const box = document.querySelector(".transaction-placeholder");
    if (!box || !currentWalletId) return;
    box.textContent = "Loading…";
    try {
      const data = await getRecent(currentWalletId);
      if (!Array.isArray(data) || !data.length) { box.textContent = "No transactions yet."; return; }
      box.innerHTML = "<strong>Recent Transactions:</strong><ul style='list-style:none;padding-left:0;margin-top:6px;'>";
      data.forEach(tx => {
        const sign = (tx.type||"").toLowerCase() === "credit" ? "+" : "-";
        const color = sign === "+" ? "green" : "red";
        const amt = dollars(Math.abs(Number(tx.amount_cents||0)));
        box.innerHTML += `<li style="color:${color}">${sign}${amt} — ${tx.note || tx.description || ""}</li>`;
      });
      box.innerHTML += "</ul>";
    } catch (e) {
      console.error(e); box.textContent = "Failed to load transactions."; showStatus(e.message, "red");
    }
  }

  // ---- Events
  walletSelect.addEventListener("change", async (e) => {
    currentWalletId = e.target.value;
    await refreshBalance();
    await refreshRecent();
  });

  submitBtn.addEventListener("click", async () => {
    const amount = parseFloat(amountInput.value);
    const note   = noteInput.value.trim();
    const type   = typeSelect.value; // "credit" or "debit"
    if (!currentWalletId) return showStatus("Select a treasury wallet first.", "red");
    if (isNaN(amount) || amount <= 0) return showStatus("Amount must be greater than zero.", "red");
    if (!note) return showStatus("Note is required.", "red");

    try {
      await postAdjust(currentWalletId, { amount_cents: Math.round(amount*100), type, note });
      showStatus("✅ Adjustment successful!", "green");
      amountInput.value = ""; noteInput.value = "";
      await refreshBalance(); await refreshRecent();
    } catch (e) {
      console.error(e); showStatus(e.message || "Unknown error.", "red");
    }
  });

  // ---- Boot
  (async function init(){
    try {
      wallets = await getTreasuryWallets(); // each: { id, name/label }
      if (!Array.isArray(wallets) || !wallets.length) throw new Error("No treasury wallets configured.");
      fillWalletSelect();
      await refreshBalance();
      await refreshRecent();
    } catch (e) {
      console.error(e);
      showStatus(e.message || "Failed to initialize.", "red");
    }
  })();  // end init()
});      // end DOMContentLoaded
