// public/accounts/transfers.js
// Client logic for Admin → Transfers (Merchant wallet aware)

(() => {
  const token = localStorage.getItem("boop_jwt");

  // --- DOM refs
  const tabs = [...document.querySelectorAll(".tab-btn")];
  const tbody = document.getElementById("transferTableBody");
  const paginationInfo = document.getElementById("paginationInfo");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const exportBtn = document.getElementById("exportBtn");

  // Filters
  const startDateEl = document.getElementById("startDate");
  const endDateEl = document.getElementById("endDate");
  const bankFilterEl = document.getElementById("bankFilter");
  const applyFiltersBtn = document.getElementById("applyFiltersBtn");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");

  // Modal
  const modal = document.getElementById("detailsModal");
  const closeDetails = document.getElementById("closeDetails");
  const d_reqId = document.getElementById("d_reqId");
  const d_status = document.getElementById("d_status");
  const d_user = document.getElementById("d_user");
  const d_requestedAt = document.getElementById("d_requestedAt");
  const d_amount = document.getElementById("d_amount");
  const d_bank = document.getElementById("d_bank");
  const d_destination = document.getElementById("d_destination");
  const d_treasury = document.getElementById("d_treasury"); // now filled with merchant wallets
  const d_bankRef = document.getElementById("d_bankRef");
  const d_internalNote = document.getElementById("d_internalNote");
  const claimBtn = document.getElementById("claimBtn");
  const releaseBtn = document.getElementById("releaseBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const completeBtn = document.getElementById("completeBtn");
  const completeHelp = document.getElementById("completeHelp");

  // Dynamic fields we might inject
  let d_balance = document.getElementById("d_balance");
  let bankDetailsWrap = null; // wrapper div we inject for full bank details
  let d_bankFull = null;      // the readonly textarea / input we show

  // --- State
  let me = JSON.parse(localStorage.getItem("boopUser") || "null");
  let tabStatus = "pending"; // 'pending' | 'claimed' | 'completed' | 'rejected'
  let page = 1;
  const perPage = 20;
  let totalPages = 1;
  let rows = []; // last fetched page
  // Holds MERCHANT wallets (fallback to treasury wallets if endpoint missing)
  let treasuries = [];
  let currentRow = null; // row shown in modal

  // --- Helpers
  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  function fmtMoney(cents) {
    const n = Number(cents || 0) / 100;
    return `BMD $${n.toFixed(2)}`;
  }
  function dollarsOnly(v) {
    const n = Number(v || 0) / 100;
    return n.toFixed(2);
  }
  function fmtDate(v) {
    if (!v) return "—";
    let s = String(v).trim();
    s = s.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
    s = s.replace(/\+00(?::00)?$/, "Z");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) s += "Z";
    const d = new Date(s);
    return isNaN(d) ? String(v) : d.toLocaleString();
  }
  function maskDest(r) {
    const acct =
      r.dest_last4 ||
      r.account_last4 ||
      r.mask_last4 ||
      (r.destination_masked && r.destination_masked.slice(-4));
    const bank = r.bank || r.preferred_bank || "";
    if (acct) return `${bank} •••• ${acct}`;
    return r.dest_label || r.destination_masked || bank || "—";
  }
  function statusPill(s) {
    const t = String(s || "").toLowerCase();
    const cls =
      t === "pending" ? "s-pending" :
      t === "claimed" ? "s-claimed" :
      t === "completed" ? "s-completed" :
      t === "rejected" ? "s-rejected" : "";
    return `<span class="status-pill ${cls}">${t || "—"}</span>`;
  }
  function setActiveTab(btn) {
    tabs.forEach(b => b.classList.toggle("active", b === btn));
  }
  function setPaginationUI() {
    paginationInfo.textContent = `Page ${totalPages ? page : 0} of ${totalPages || 0}`;
    prevPageBtn.disabled = page <= 1;
    nextPageBtn.disabled = page >= totalPages;
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }

  // --- Networking
  // Load MERCHANT wallets; fallback to treasury list if merchant endpoint doesn't exist yet
  async function fetchTreasuries() {
    try {
      let res = await fetch("/api/treasury/merchant-wallets", { headers: authHeaders() }).catch(()=>null);
      let data = null;

      if (!res || res.status === 404) {
        // fallback to old endpoint
        res = await fetch("/api/treasury/treasury-wallets", { headers: authHeaders() }).catch(()=>null);
      }
      if (!res) throw new Error("No wallet endpoint available");
      data = await res.json();
      if (!Array.isArray(data)) throw new Error(data?.message || "Failed to load merchant wallets");

      treasuries = data;
    } catch (e) {
      treasuries = [];
      console.warn("merchant/treasury wallet fetch error", e);
    }
  }

  async function fetchTransfers() {
    const params = new URLSearchParams();
    params.set("status", tabStatus);
    params.set("limit", String(perPage));
    params.set("offset", String((page - 1) * perPage));
    if (startDateEl.value) params.set("start", startDateEl.value);
    if (endDateEl.value) params.set("end", endDateEl.value);
    if (bankFilterEl.value) params.set("bank", bankFilterEl.value);

    const res = await fetch(`/api/transfers?${params.toString()}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Failed to fetch: ${res.status}`);

    rows = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
    const total = Number(data.total || 0);
    totalPages = Math.max(1, Math.ceil(total / perPage));
    setPaginationUI();
    renderTable();
  }

  async function sendJSON(url, method = "POST", body) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type":"application/json", ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // Full bank details: only available when claimed by me
  async function fetchFullBankDetails(transferId) {
    const res = await fetch(`/api/transfers/${transferId}/bank-details`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to load bank details');
    return res.json();
  }

  // Try to fetch a user's current wallet balance (in cents).
  async function fetchUserBalanceCents(userId) {
    try {
      const res = await fetch(`/api/wallets/user/${userId}`, { headers: authHeaders() });
      if (!res.ok) return null;
      const j = await res.json();
      const cents = Number(j?.balance_cents);
      return Number.isFinite(cents) ? cents : null;
    } catch {
      return null;
    }
  }

  // --- Table rendering
  function actionButtonsFor(r) {
    const s = String(r.status || "").toLowerCase();

    if (s === "completed" || s === "rejected") {
      return `<button class="btn" data-action="view" data-id="${r.id}" style="padding:6px 10px;">Open</button>`;
    }

    const mine = me && r.claimed_by === me.id;
    const canClaim    = s === "pending";
    const canRelease  = s === "claimed" && mine;
    const canComplete = s === "claimed" && mine;

    const view     = `<button class="btn" data-action="view" data-id="${r.id}" style="padding:6px 10px;">Open</button>`;
    const claim    = canClaim    ? `<button class="btn warn"      data-action="claim"    data-id="${r.id}" style="padding:6px 10px;">Claim</button>` : "";
    const release  = canRelease  ? `<button class="btn secondary" data-action="release"  data-id="${r.id}" style="padding:6px 10px;">Release</button>` : "";
    const complete = canComplete ? `<button class="btn"           data-action="complete" data-id="${r.id}" style="padding:6px 10px;">Complete</button>` : "";

    return [view, claim, release, complete].filter(Boolean).join(" ");
  }

  function renderTable() {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="muted">No transfer requests found.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const who = r.user_name || r.cardholder_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.user_email || "—";
      const actions = actionButtonsFor(r);
      return `
        <tr data-id="${r.id}">
          <td>${fmtDate(r.requested_at || r.created_at)}</td>
          <td>${r.id}</td>
          <td>${escapeHtml(who)}</td>
          <td>${fmtMoney(r.amount_cents)}</td>
          <td>${escapeHtml(maskDest(r))}</td>
          <td>${statusPill(r.status)}</td>
          <td>${r.claimed_by_name ? escapeHtml(r.claimed_by_name) : (r.claimed_by ? "—" : "—")}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", onRowActionClick);
    });
  }

  // --- Row actions
  async function onRowActionClick(e) {
    const btn = e.currentTarget;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const row = rows.find(r => String(r.id) === String(id));
    if (!row) return;

    if (action === "view") {
      openModal(row);
      return;
    }
    if (action === "claim") {
      try {
        await sendJSON(`/api/transfers/${id}/claim`, "PATCH");
        await fetchTransfers();
        const updated = rows.find(r => String(r.id) === String(id));
        openModal(updated || row);
      } catch (err) {
        alert(`Claim failed: ${err.message}`);
      }
      return;
    }
    if (action === "release") {
      try {
        await sendJSON(`/api/transfers/${id}/release`, "PATCH");
        await fetchTransfers();
        closeModal();
      } catch (err) {
        alert(`Release failed: ${err.message}`);
      }
      return;
    }
    if (action === "complete") {
      openModal(row);
      return;
    }
  }

  // --- Modal helpers / dynamic fields
  function ensureBalanceField() {
    d_balance = document.getElementById("d_balance");
    if (d_balance) return d_balance;

    const amountField = d_amount?.closest(".field");
    if (!amountField) return null;

    const balanceField = document.createElement("div");
    balanceField.className = "field";
    balanceField.innerHTML = `
      <label>Cardholder Balance</label>
      <input id="d_balance" type="text" disabled>
    `;
    amountField.insertAdjacentElement("afterend", balanceField);
    d_balance = balanceField.querySelector("#d_balance");
    return d_balance;
  }

  // Create (if needed) a read-only “Full Bank Details” area right after Destination
  function ensureBankDetailsField() {
    if (bankDetailsWrap && d_bankFull) return { wrap: bankDetailsWrap, input: d_bankFull };

    const destField = d_destination?.closest(".field");
    if (!destField) return { wrap: null, input: null };

    bankDetailsWrap = document.createElement("div");
    bankDetailsWrap.className = "field";
    bankDetailsWrap.style.display = "none"; // hidden by default
    bankDetailsWrap.innerHTML = `
      <label>Full Bank Details (visible to claimer)</label>
      <textarea id="d_bankFull" rows="3" readonly style="resize:vertical"></textarea>
    `;

    destField.insertAdjacentElement("afterend", bankDetailsWrap);
    d_bankFull = bankDetailsWrap.querySelector("#d_bankFull");
    return { wrap: bankDetailsWrap, input: d_bankFull };
  }

  function noteFieldWrapper() {
    return d_internalNote ? (d_internalNote.closest(".field") || d_internalNote.parentElement) : null;
  }

  function toggleFinalizeExtras(visible) {
    const noteWrap = noteFieldWrapper();
    if (noteWrap) noteWrap.style.display = visible ? "" : "none";
    if (completeHelp) completeHelp.style.display = visible ? "" : "none";
  }

  function fillTreasurySelect() {
    if (!d_treasury) return;
    d_treasury.innerHTML =
      `<option value="">Select wallet</option>` +
      treasuries
        .map(t => {
          const name = t.name || t.label || t.bank_name || `Wallet ${t.id}`;
          const bal = typeof t.balance_cents === "number" ? ` — ${fmtMoney(t.balance_cents)}` : "";
          return `<option value="${t.id}">${escapeHtml(name + bal)}</option>`;
        })
        .join("");
  }

  function setModalActionsFor(row) {
    const s = String(row.status || "").toLowerCase();
    const mine = me && row.claimed_by === me.id;

    // hide all by default
    claimBtn.style.display = "none";
    releaseBtn.style.display = "none";
    completeBtn.style.display = "none";
    if (rejectBtn) rejectBtn.style.display = "none";

    d_treasury.disabled = true;
    d_bankRef.disabled = true;
    d_internalNote.disabled = true;

    // Completed/rejected → view only; also hide note + helper + full bank
    if (s === "completed" || s === "rejected") {
      toggleFinalizeExtras(false);
      if (bankDetailsWrap) bankDetailsWrap.style.display = "none";
      return;
    }

    // Pending → can Claim/Reject; hide finalize extras and full bank
    if (s === "pending") {
      claimBtn.style.display = "inline-block";
      if (rejectBtn) rejectBtn.style.display = "inline-block";
      toggleFinalizeExtras(false);
      if (bankDetailsWrap) bankDetailsWrap.style.display = "none";
      return;
    }

    // Claimed → if it's mine, can Release/Complete/Reject; show finalize extras
    if (s === "claimed" && mine) {
      releaseBtn.style.display = "inline-block";
      completeBtn.style.display = "inline-block";
      if (rejectBtn) rejectBtn.style.display = "inline-block";

      d_treasury.disabled = false;
      d_bankRef.disabled = false;
      d_internalNote.disabled = false;

      toggleFinalizeExtras(true);
      // full bank details visibility toggled in openModal() after we fetch them
      return;
    }

    // Claimed, but not mine → hide finalize extras and full bank
    toggleFinalizeExtras(false);
    if (bankDetailsWrap) bankDetailsWrap.style.display = "none";
  }

  async function openModal(row) {
    currentRow = row;
    d_reqId.value = row.id || "";
    d_status.value = String(row.status || "").toUpperCase();
    d_user.value = row.user_name || row.cardholder_name || row.user_email || "—";
    d_requestedAt.value = fmtDate(row.requested_at || row.created_at);
    d_amount.value = fmtMoney(row.amount_cents);
    d_bank.value = row.bank || row.preferred_bank || "—";
    d_destination.value = maskDest(row);
    d_bankRef.value = row.bank_reference || "";
    d_internalNote.value = row.internal_note || "";

    fillTreasurySelect();
    setModalActionsFor(row);

    // Ensure balance field exists, then fetch & show balance
    const balInput = ensureBalanceField();
    if (balInput) {
      balInput.value = "Loading…";
      const cents = await fetchUserBalanceCents(row.user_id);
      balInput.value = cents == null ? "—" : fmtMoney(cents);
    }

    // If this transfer is claimed and claimed by me, fetch + show full bank details
    const s = String(row.status || "").toLowerCase();
    const mine = me && row.claimed_by === me.id;
    const { wrap, input } = ensureBankDetailsField();
    if (wrap && input) {
      if (s === "claimed" && mine) {
        input.value = "Loading…";
        wrap.style.display = ""; // show area immediately
        try {
          const details = await fetchFullBankDetails(row.id);
          // Compose a handy block for quick copy
          const lines = [
            details.bank_name ? `Bank: ${details.bank_name}` : null,
            details.account_holder_name ? `Account Name: ${details.account_holder_name}` : null,
            details.account_number ? `Account Number: ${details.account_number}` : null,
            details.routing_number ? `Routing: ${details.routing_number}` : null,
            details.iban ? `IBAN: ${details.iban}` : null,
            details.swift ? `SWIFT: ${details.swift}` : null,
            details.country ? `Country: ${details.country}` : null
          ].filter(Boolean);
          input.value = lines.length ? lines.join('\n') : '—';
        } catch (e) {
          console.warn(e);
          input.value = 'Failed to load bank details.';
        }
      } else {
        // Not claimed by me: hide the field and clear
        wrap.style.display = "none";
        input.value = "";
      }
    }

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.style.display = "none";
    currentRow = null;
    document.body.style.overflow = "";
  }

  closeDetails.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Modal buttons
  claimBtn.addEventListener("click", async () => {
    if (!currentRow) return;
    try {
      await sendJSON(`/api/transfers/${currentRow.id}/claim`, "PATCH");
      await fetchTransfers();
      closeModal(); // close after success
    } catch (err) {
      alert(`Claim failed: ${err.message}`);
    }
  });

  releaseBtn.addEventListener("click", async () => {
    if (!currentRow) return;
    try {
      await sendJSON(`/api/transfers/${currentRow.id}/release`, "PATCH");
      await fetchTransfers();
      closeModal();
    } catch (err) {
      alert(`Release failed: ${err.message}`);
    }
  });

  if (rejectBtn) {
    rejectBtn.addEventListener("click", async () => {
      if (!currentRow) return;
      const reason = prompt("Enter a short reason for rejection (optional):") || "";
      try {
        await sendJSON(`/api/transfers/${currentRow.id}/reject`, "PATCH", { reason });
        await fetchTransfers();
        closeModal(); // close after success
      } catch (err) {
        alert(`Reject failed: ${err.message}`);
      }
    });
  }

  completeBtn.addEventListener("click", async () => {
    if (!currentRow) return;

    const bank_reference = d_bankRef.value.trim();
    const treasury_wallet_id = d_treasury.value; // holds MERCHANT wallet id now
    const internal_note = d_internalNote.value.trim();

    if (!treasury_wallet_id) {
      alert("Please select the Source Merchant Wallet.");
      return;
    }
    if (!bank_reference || bank_reference.length < 4) {
      alert("Please paste the Bank Reference # (min 4 characters).");
      return;
    }

    const prevText = completeBtn.textContent;
    completeBtn.disabled = true;
    completeBtn.textContent = "Completing…";

    try {
      await sendJSON(`/api/transfers/${currentRow.id}/complete`, "PATCH", {
        bank_reference,
        treasury_wallet_id,
        internal_note
      });
      await fetchTransfers();
      closeModal(); // close after success
    } catch (err) {
      console.error(err);
      alert(`Complete failed: ${err.message}`);
    } finally {
      completeBtn.disabled = false;
      completeBtn.textContent = prevText;
    }
  });

  // --- Pagination
  prevPageBtn.addEventListener("click", () => {
    if (page > 1) { page--; fetchTransfers().catch(showErr); }
  });
  nextPageBtn.addEventListener("click", () => {
    if (page < totalPages) { page++; fetchTransfers().catch(showErr); }
  });

  // --- Filters
  applyFiltersBtn.addEventListener("click", () => { page = 1; fetchTransfers().catch(showErr); });
  clearFiltersBtn.addEventListener("click", () => {
    startDateEl.value = "";
    endDateEl.value = "";
    bankFilterEl.value = "";
    page = 1;
    fetchTransfers().catch(showErr);
  });

  // --- Tabs
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabStatus = btn.dataset.status;
      setActiveTab(btn);
      page = 1;
      fetchTransfers().catch(showErr);
    });
  });

  // --- Refresh
  refreshBtn.addEventListener("click", () => { fetchTransfers().catch(showErr); });

  // --- Export
  exportBtn.addEventListener("click", () => {
    if (!rows.length) return;
    const headers = ["Requested","RequestID","Cardholder","Amount","Bank","DestinationMasked","Status","ClaimedBy","BankRef"];
    const data = rows.map(r => [
      fmtDate(r.requested_at || r.created_at),
      r.id,
      (r.user_name || r.cardholder_name || r.user_email || "").replace(/,/g," "),
      dollarsOnly(r.amount_cents),
      (r.bank || r.preferred_bank || ""),
      maskDest(r).replace(/,/g," "),
      String(r.status||""),
      (r.claimed_by_name || "").replace(/,/g," "),
      (r.bank_reference || "").replace(/,/g," "),
    ]);
    const csv = [headers, ...data].map(a => a.join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `boop-transfers-${tabStatus}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  function showErr(err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Error: ${escapeHtml(err.message || 'Failed to load')}</td></tr>`;
  }

  // --- Boot
  (async function init(){
    try {
      await fetchTreasuries();   // loads merchant wallets (or fallback)
      await fetchTransfers();
    } catch (err) {
      showErr(err);
    }
  })();
})();
