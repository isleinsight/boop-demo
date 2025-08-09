// public/admin/transfers.js
// Client logic for Admin → Transfers

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
  const d_treasury = document.getElementById("d_treasury");
  const d_bankRef = document.getElementById("d_bankRef");
  const d_internalNote = document.getElementById("d_internalNote");
  const claimBtn = document.getElementById("claimBtn");
  const releaseBtn = document.getElementById("releaseBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const completeBtn = document.getElementById("completeBtn");

  // --- State
  let me = JSON.parse(localStorage.getItem("boopUser") || "null");
  let tabStatus = "pending";     // 'pending' | 'claimed' | 'completed' | 'rejected'
  let page = 1;
  const perPage = 20;
  let totalPages = 1;
  let rows = [];                 // last fetched page
  let treasuries = [];           // from /api/treasury/treasury-wallets
  let currentRow = null;         // row shown in modal

  // --- Helpers
  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  function fmtMoney(cents) {
    const n = Number(cents || 0) / 100;
    return `$${n.toFixed(2)}`;
  }
  function fmtDate(d) {
    try { return new Date(d).toLocaleString(); } catch { return d || ""; }
  }
  function maskDest(r) {
    // Show masked destination (account/iban/route). Prefer last 4 if present.
    const acct = r.dest_last4 || r.account_last4 || r.mask_last4;
    const bank = r.bank || r.preferred_bank || "";
    if (acct) return `${bank} •••• ${acct}`;
    // fallback to label if provided
    return r.dest_label || bank || "—";
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
  function dollarsOnly(v) {
    const n = Number(v || 0) / 100;
    return n.toFixed(2);
  }

  function setActiveTab(btn) {
    tabs.forEach(b => b.classList.toggle("active", b === btn));
  }

  function setPaginationUI() {
    paginationInfo.textContent = `Page ${totalPages ? page : 0} of ${totalPages || 0}`;
    prevPageBtn.disabled = page <= 1;
    nextPageBtn.disabled = page >= totalPages;
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
          <td>${fmtDate(r.created_at)}</td>
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

    // wire action buttons
    tbody.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", onRowActionClick);
    });
  }

  function actionButtonsFor(r) {
    const s = String(r.status || "").toLowerCase();
    const mine = me && r.claimed_by === me.id;
    const canClaim = s === "pending";
    const canRelease = s === "claimed" && mine;
    const canComplete = s === "claimed" && mine;
    const canReject = s === "pending" || (s === "claimed" && mine);

    const view = `<button class="btn" data-action="view" data-id="${r.id}" style="padding:6px 10px;">Open</button>`;
    const claim = canClaim ? `<button class="btn warn" data-action="claim" data-id="${r.id}" style="padding:6px 10px;">Claim</button>` : "";
    const release = canRelease ? `<button class="btn secondary" data-action="release" data-id="${r.id}" style="padding:6px 10px;">Release</button>` : "";
    const complete = canComplete ? `<button class="btn" data-action="complete" data-id="${r.id}" style="padding:6px 10px;">Complete</button>` : "";
    const reject = canReject ? `<button class="btn danger" data-action="reject" data-id="${r.id}" style="padding:6px 10px;">Reject</button>` : "";

    // Keep it compact
    return [view, claim, release, complete, reject].filter(Boolean).join(" ");
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }

  // --- Networking
  async function fetchTreasuries() {
    try {
      const res = await fetch("/api/treasury/treasury-wallets", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.message || "Failed to load treasuries");
      treasuries = data;
    } catch (e) {
      treasuries = [];
      console.warn("treasury fetch error", e);
    }
  }

  async function fetchTransfers() {
    const params = new URLSearchParams();
    params.set("status", tabStatus);
    params.set("page", String(page));
    params.set("perPage", String(perPage));
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

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type":"application/json", ...authHeaders() },
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
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
        await postJSON(`/api/transfers/${id}/claim`);
        await fetchTransfers();
        // Open right away for flow
        const updated = rows.find(r => String(r.id) === String(id));
        openModal(updated || row);
      } catch (err) {
        alert(`Claim failed: ${err.message}`);
      }
      return;
    }
    if (action === "release") {
      try {
        await postJSON(`/api/transfers/${id}/release`);
        await fetchTransfers();
        closeModal();
      } catch (err) {
        alert(`Release failed: ${err.message}`);
      }
      return;
    }
    if (action === "reject") {
      const reason = prompt("Enter a short reason for rejection (optional):") || "";
      try {
        await postJSON(`/api/transfers/${id}/reject`, { reason });
        await fetchTransfers();
        closeModal();
      } catch (err) {
        alert(`Reject failed: ${err.message}`);
      }
      return;
    }
    if (action === "complete") {
      openModal(row); // ensure modal open so they can fill Bank Ref + Treasury
      return;
    }
  }

  // --- Modal logic
  function fillTreasurySelect() {
    if (!d_treasury) return;
    d_treasury.innerHTML = `<option value="">Select treasury</option>` +
      treasuries.map(t => `<option value="${t.id}">${escapeHtml(t.name || t.label || t.id)}</option>`).join("");
  }

  function openModal(row) {
    currentRow = row;
    d_reqId.value = row.id || "";
    d_status.value = String(row.status || "").toUpperCase();
    d_user.value = row.user_name || row.cardholder_name || row.user_email || "—";
    d_requestedAt.value = fmtDate(row.created_at);
    d_amount.value = fmtMoney(row.amount_cents);
    d_bank.value = row.bank || row.preferred_bank || "—";
    d_destination.value = maskDest(row);
    d_bankRef.value = row.bank_reference || "";
    d_internalNote.value = row.internal_note || "";

    // Buttons enablement by status/ownership
    const s = String(row.status || "").toLowerCase();
    const mine = me && row.claimed_by === me.id;

    claimBtn.disabled = !(s === "pending");
    releaseBtn.disabled = !(s === "claimed" && mine);
    rejectBtn.disabled = !(s === "pending" || (s === "claimed" && mine));
    completeBtn.disabled = !(s === "claimed" && mine);

    // Treasury select (always fill)
    fillTreasurySelect();

    modal.style.display = "flex";
  }

  function closeModal() {
    modal.style.display = "none";
    currentRow = null;
  }

  closeDetails.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Modal buttons
  claimBtn.addEventListener("click", async () => {
    if (!currentRow) return;
    try {
      await postJSON(`/api/transfers/${currentRow.id}/claim`);
      await fetchTransfers();
      const updated = rows.find(r => String(r.id) === String(currentRow.id));
      openModal(updated || currentRow);
    } catch (err) {
      alert(`Claim failed: ${err.message}`);
    }
  });

  releaseBtn.addEventListener("click", async () => {
    if (!currentRow) return;
    try {
      await postJSON(`/api/transfers/${currentRow.id}/release`);
      await fetchTransfers();
      closeModal();
    } catch (err) {
      alert(`Release failed: ${err.message}`);
    }
  });

  rejectBtn.addEventListener("click", async () => {
    if (!currentRow) return;
    const reason = prompt("Enter a short reason for rejection (optional):") || "";
    try {
      await postJSON(`/api/transfers/${currentRow.id}/reject`, { reason });
      await fetchTransfers();
      closeModal();
    } catch (err) {
      alert(`Reject failed: ${err.message}`);
    }
  });

  completeBtn.addEventListener("click", async () => {
    if (!currentRow) return;
    const bank_reference = d_bankRef.value.trim();
    const treasury_wallet_id = d_treasury.value;
    const internal_note = d_internalNote.value.trim();

    if (!treasury_wallet_id) {
      alert("Please select the Source Treasury.");
      return;
    }
    if (!bank_reference) {
      alert("Please paste the Bank Reference # from the bank portal.");
      return;
    }

    try {
      await postJSON(`/api/transfers/${currentRow.id}/complete`, {
        bank_reference,
        treasury_wallet_id,
        internal_note
      });
      await fetchTransfers();
      closeModal();
    } catch (err) {
      alert(`Complete failed: ${err.message}`);
    }
  });

  // --- Pagination
  prevPageBtn.addEventListener("click", () => { if (page > 1) { page--; fetchTransfers().catch(showErr); } });
  nextPageBtn.addEventListener("click", () => { if (page < totalPages) { page++; fetchTransfers().catch(showErr); } });

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
      fmtDate(r.created_at),
      r.id,
      (r.user_name || r.cardholder_name || r.user_email || "").replace(/,/g," "),
      dollarsOnly(r.amount_cents),
      r.bank || r.preferred_bank || "",
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
      await fetchTreasuries();
      await fetchTransfers();
    } catch (err) {
      showErr(err);
    }
  })();
})();
