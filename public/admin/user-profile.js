// File: pages/user-profile.js
let currentPage = 1;
const transactionsPerPage = 10;

document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const currentAdmin = JSON.parse(localStorage.getItem("boopUser"));
  if (currentAdmin?.role === "admin" && ["viewer", "accountant"].includes(currentAdmin?.type)) {
    if (editBtn) editBtn.style.display = "none";
  }

  const logoutBtn = document.getElementById("logoutBtn");
  const studentInfoSection = document.getElementById("studentInfoSection");

  let currentUserId =
    localStorage.getItem("selectedUserId") ||
    new URLSearchParams(window.location.search).get("uid");

  currentUserId = currentUserId?.replace(/\s+/g, "");
  let currentUserData = null;
  let isEditMode = false;

  if (!currentUserId) {
    alert("User ID not found.");
    window.location.href = "view-users.html";
    return;
  }

  // ---------- helpers ----------
  async function fetchJSON(url, options = {}) {
    const token = localStorage.getItem("boop_jwt");
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (options.autoRedirect !== false) {
      window.location.href = "../government-portal.html";
      return Promise.reject(new Error("Unauthorized"));
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      if (options.autoRedirect !== false) window.location.href = "../government-portal.html";
      throw new Error("Unauthorized");
    }
    if (!res.ok) throw new Error((await res.text()) || "Network error");
    return res.json();
  }

  function formatDatePretty(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  // ---------- PASSPORT (Tap Link) ----------
  function setTapStatus(msg, isError = false) {
    const el = document.getElementById("tapLinkStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#b91c1c" : "#6b7280";
  }

  function buildActionsHTML() {
    return `
      <select id="passportActions" style="min-width:220px;">
        <option value="">Select action…</option>
        <option value="copy">Copy Tap Link</option>
        <option value="open">Open Tap Link</option>
        <option value="regen">Regenerate Passport ID</option>
      </select>
      <span id="tapLinkStatus" style="margin-left:8px;color:#6b7280;"></span>
    `;
  }

  function ensurePassportSection() {
    let section = document.getElementById("passportSection");
    const page = document.querySelector(".user-profile-page");
    if (!page) return null;

    if (!section) {
      const sectionTitle = document.createElement("div");
      sectionTitle.className = "section-title";
      sectionTitle.textContent = "Passport";

      section = document.createElement("div");
      section.className = "user-details-grid";
      section.id = "passportSection";
      section.innerHTML = `
        <div>
          <span class="label">Tap Link</span>
          <span class="value" id="passportTapLinkValue">Loading…</span>
          <input type="text" id="passportTapLinkInput" style="display:none; width:100%;" readonly />
        </div>
        <div>
          <span class="label">Actions</span>
          <div class="value">${buildActionsHTML()}</div>
        </div>
      `;
      const txnTitle = Array.from(page.querySelectorAll(".section-title"))
        .find((el) => el.textContent.trim() === "Transaction History");
      if (txnTitle) {
        page.insertBefore(sectionTitle, txnTitle);
        page.insertBefore(section, txnTitle);
      } else {
        page.appendChild(sectionTitle);
        page.appendChild(section);
      }
      return section;
    }

    // Normalize existing section that still has the old Copy button
    const copyBtn = section.querySelector("#copyTapLinkBtn");
    const hasDropdown = section.querySelector("#passportActions");
    if (!hasDropdown) {
      if (copyBtn) {
        const valueDiv = copyBtn.parentElement;
        if (valueDiv) valueDiv.innerHTML = buildActionsHTML(); // replace button with dropdown
      } else {
        // If there's no Actions row at all, append one
        const actionsRow = document.createElement("div");
        actionsRow.innerHTML = `
          <span class="label">Actions</span>
          <div class="value">${buildActionsHTML()}</div>
        `;
        section.appendChild(actionsRow);
      }
    }

    // Ensure Tap Link line exists
    if (!section.querySelector("#passportTapLinkValue")) {
      const tapRow = document.createElement("div");
      tapRow.innerHTML = `
        <span class="label">Tap Link</span>
        <span class="value" id="passportTapLinkValue">Loading…</span>
        <input type="text" id="passportTapLinkInput" style="display:none; width:100%;" readonly />
      `;
      section.insertBefore(tapRow, section.firstChild);
    }

    // Ensure status span exists
    if (!section.querySelector("#tapLinkStatus")) {
      const actionsValue = section.querySelector("#passportActions")?.parentElement;
      if (actionsValue) actionsValue.insertAdjacentHTML("beforeend", `<span id="tapLinkStatus" style="margin-left:8px;color:#6b7280;"></span>`);
    }

    return section;
  }

  async function loadPassport(userId) {
    ensurePassportSection();

    const valueSpan = document.getElementById("passportTapLinkValue");
    const input = document.getElementById("passportTapLinkInput");
    let actions = document.getElementById("passportActions");
    if (!valueSpan || !actions) return;

    valueSpan.textContent = "Loading…";
    if (input) input.style.display = "none";
    actions.disabled = true;
    setTapStatus("");

    try {
      const data = await fetchJSON(`/api/passport/${encodeURIComponent(userId)}`);
      const passportId = data?.passportId ?? data?.passport_id;

      if (!passportId) {
        valueSpan.textContent = "No passport assigned";
        setTapStatus("Select “Regenerate” to create a new passport ID.", true);
        actions.disabled = false;
        const fresh = actions.cloneNode(true);
        actions.parentNode.replaceChild(fresh, actions);
        fresh.addEventListener("change", async () => {
          const choice = fresh.value;
          fresh.value = "";
          if (choice !== "regen") return;
          try {
            if (!confirm("Regenerate passport ID? This invalidates any old NFC card.")) return;
            setTapStatus("Regenerating…");
            await fetchJSON(`/api/passport/${encodeURIComponent(userId)}/regenerate`, { method: "POST" });
            setTapStatus("New passport ID created.");
            await loadPassport(userId);
          } catch (err) {
            setTapStatus(err.message || "Failed to regenerate.", true);
          }
        });
        return;
      }

      const tapLink = `https://payulot.com/tap.html?pid=${encodeURIComponent(passportId)}`;
      valueSpan.textContent = tapLink;
      if (input) input.value = tapLink;

      const fresh = actions.cloneNode(true);
      actions.parentNode.replaceChild(fresh, actions);
      fresh.disabled = false;
      fresh.addEventListener("change", async () => {
        const choice = fresh.value;
        fresh.value = "";
        if (!choice) return;
        try {
          if (choice === "copy") {
            await navigator.clipboard.writeText(tapLink);
            setTapStatus("Copied to clipboard.");
          } else if (choice === "open") {
            window.open(tapLink, "_blank", "noopener");
            setTapStatus("");
          } else if (choice === "regen") {
            if (!confirm("Regenerate passport ID? This invalidates the old NFC card.")) return;
            setTapStatus("Regenerating…");
            await fetchJSON(`/api/passport/${encodeURIComponent(userId)}/regenerate`, { method: "POST" });
            setTapStatus("New passport ID created.");
            await loadPassport(userId);
          }
        } catch (err) {
          setTapStatus(err.message || "Action failed", true);
        }
      });
    } catch (err) {
      valueSpan.textContent = "Error loading Tap Link";
      setTapStatus(err.message || "Failed to load tap link", true);
      actions.disabled = false;
    }
  }

  // ---------- MAIN ----------
  async function loadUserProfile() {
    try {
      let user = await fetchJSON(`/api/users/${currentUserId}`);
      currentUserData = user;

      let walletHTML = "";
      if (user.wallet_id || user.wallet?.id) {
        try {
          const allCards = await fetchJSON(`/api/cards?wallet_id=${user.wallet_id || user.wallet?.id}`);
          const transitCards = allCards.filter((c) => c.type === "transit");
          const spendingCards = allCards.filter((c) => c.type === "spending");
          if (transitCards.length) {
            transitCards.forEach((card) => {
              walletHTML += `<div><span class="label">Transit Card</span><span class="value">${card.uid}</span></div>`;
            });
          } else {
            walletHTML += `<div><span class="label">Transit Card</span><span class="value">None</span></div>`;
          }
          if (spendingCards.length) {
            spendingCards.forEach((card) => {
              walletHTML += `<div><span class="label">Spending Card</span><span class="value">${card.uid}</span></div>`;
            });
          }
        } catch {
          walletHTML += `<div><span class="label">Cards</span><span class="value">Failed to load</span></div>`;
        }
      } else {
        walletHTML += `<div><span class="label">Cards</span><span class="value">Not applicable</span></div>`;
      }

      let assistanceHTML = "";
      if ((user.wallet || user.wallet_id) && (user.role === "cardholder" || user.role === "senior")) {
        assistanceHTML = `
          <div>
            <span class="label">On Assistance</span>
            <span class="value" id="viewAssistance">${user.on_assistance ? "Yes" : "No"}</span>
            <select id="editAssistance" style="display:none; width: 100%;">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        `;
      }

      let walletBalance = "N/A";
      try {
        const w = await fetchJSON(`/api/wallets/user/${user.id}`);
        const cents = Number(w?.balance_cents ?? w?.balance ?? w?.wallet?.balance_cents ?? w?.wallet?.balance ?? 0);
        if (Number.isFinite(cents)) walletBalance = `$${(cents / 100).toFixed(2)}`;
      } catch {}

      userInfo.innerHTML = `
        <div><span class="label">User ID</span><span class="value">${user.id}</span></div>
        <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.first_name}</span>
          <input type="text" id="editFirstName" value="${user.first_name}" style="display:none; width: 100%;" />
        </div>
        <div><span class="label">Middle Name</span><span class="value" id="viewMiddleName">${user.middle_name || "-"}</span>
          <input type="text" id="editMiddleName" value="${user.middle_name || ""}" style="display:none; width: 100%;" />
        </div>
        <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.last_name}</span>
          <input type="text" id="editLastName" value="${user.last_name}" style="display:none; width: 100%;" />
        </div>
        <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email}</span>
          <input type="email" id="editEmail" value="${user.email}" style="display:none; width: 100%;" />
        </div>
        <div><span class="label">Status</span><span class="value" style="color:${user.status === "suspended" ? "red" : "green"}">${user.status}</span></div>
        <div><span class="label">Role</span><span class="value">${user.role}</span></div>
        <div><span class="label">Balance</span><span class="value">${walletBalance}</span></div>
        ${assistanceHTML}
        ${walletHTML}
      `;

      // Passport section
      await loadPassport(user.id);

      // Transactions
      const transactionTableBody = document.querySelector("#transactionTable tbody");
      if (!transactionTableBody) return;
      transactionTableBody.innerHTML = "";

      let transactions = [];
      try {
        const offset = (currentPage - 1) * transactionsPerPage;
        const res = await fetchJSON(`/api/transactions/user/${user.id}?limit=${transactionsPerPage + 1}&offset=${offset}`);
        transactions = res.transactions || [];
      } catch (err) {
        console.error("Failed to fetch transactions:", err.message);
      }

      const pageTransactions = transactions.slice(0, transactionsPerPage);
      if (!pageTransactions.length) {
        transactionTableBody.innerHTML = `
          <tr><td colspan="6" style="text-align: center; padding: 20px; color: #888;">No transactions recorded.</td></tr>
        `;
      } else {
        for (const tx of pageTransactions) {
          const createdAt = tx.created_at ? new Date(tx.created_at).toLocaleString() : "-";
          const amount = typeof tx.amount_cents === "number" ? `$${(tx.amount_cents / 100).toFixed(2)}` : "-";
          const isCredit = tx.type === "credit";
          const direction = isCredit ? "Received" : tx.type === "debit" ? "Sent" : tx.type || "-";
          const counterparty = tx.counterparty_name || "Unknown";
          const name = isCredit ? `From ${counterparty}` : `To ${counterparty}`;
          const noteBtn = typeof tx.note === "string" && tx.note
            ? `<button class="btn-view-note" data-note="${tx.note.replace(/"/g, "&quot;")}">View</button>`
            : "-";
          const id = tx.id || "-";

          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${createdAt}</td>
            <td>${amount}</td>
            <td>${name}</td>
            <td>${direction}</td>
            <td>${noteBtn}</td>
            <td>${id}</td>
          `;
          transactionTableBody.appendChild(row);
        }
      }

      document.querySelectorAll(".btn-view-note").forEach((button) => {
        button.addEventListener("click", () => showNote(button.dataset.note || ""));
      });

      // Pagination
      const pageIndicator = document.getElementById("transactionPageIndicator");
      const prevBtn = document.getElementById("prevTransactions");
      const nextBtn = document.getElementById("nextTransactions");
      if (pageIndicator) pageIndicator.textContent = `Page ${currentPage}`;
      if (prevBtn) prevBtn.style.display = currentPage === 1 ? "none" : "inline-block";
      if (nextBtn) nextBtn.style.display = transactions.length > transactionsPerPage ? "inline-block" : "none";

      // Actions dropdown (admin)
      const dropdown = document.createElement("select");
      dropdown.innerHTML = `
        <option value="">Actions</option>
        <option value="${user.status === "suspended" ? "unsuspend" : "suspend"}">
          ${user.status === "suspended" ? "Unsuspend" : "Suspend"}
        </option>
        <option value="signout">Force Sign-out</option>
        <option value="delete">Delete</option>
      `;
      dropdown.addEventListener("change", async () => {
        const action = dropdown.value;
        dropdown.value = "";
        if (!action) return;

        const token = localStorage.getItem("boop_jwt");
        if (!token) return alert("Missing token.");

        let adminUser = null;
        try {
          const meRes = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
          adminUser = await meRes.json();
        } catch {}

        if (action === "delete") {
          const confirmDelete = prompt("Type DELETE to confirm.");
          if (confirmDelete !== "DELETE") return;
        }

        try {
          let res;
          if (action === "suspend" || action === "unsuspend") {
            const newStatus = action === "suspend" ? "suspended" : "active";
            res = await fetch(`/api/users/${currentUserId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error((await res.json()).message || "Failed to update status");
            alert(`User status updated to ${newStatus}.`);
            if (newStatus === "suspended") {
              await fetch(`/api/users/${currentUserId}/signout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            }
          } else if (action === "signout") {
            res = await fetch(`/api/users/${currentUserId}/signout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error((await res.json()).message || "Force sign-out failed");
            alert("User signed out.");
          } else if (action === "delete") {
            res = await fetch(`/api/users/${currentUserId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ uid: adminUser?.id }),
            });
            if (!res.ok) throw new Error((await res.json()).message || "User deletion failed");
            alert("User deleted.");
            window.location.href = "view-users.html";
            return;
          }
          await loadUserProfile();
        } catch (err) {
          console.error("Action failed:", err);
          alert("Action failed: " + err.message);
        }
      });
      userInfo.appendChild(dropdown);

      // Reset password
      const resetBtn = document.getElementById("resetPasswordBtn");
      const resetStatus = document.getElementById("resetPwStatus");
      if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
          const email = currentUserData?.email || "this user";
          if (!confirm(`Send a password reset link to ${email}?`)) return;
          try {
            resetBtn.disabled = true;
            if (resetStatus) resetStatus.textContent = "Sending…";
            if (!currentUserId || currentUserId.length < 6) return alert("No valid user ID available for reset.");
            await fetchJSON("/api/password/admin/initiate-reset", {
              method: "POST",
              body: JSON.stringify({ user_id: currentUserId, userId: currentUserId, email: currentUserData?.email || undefined }),
            });
            if (resetStatus) resetStatus.textContent = "Reset email sent";
            setTimeout(() => { if (resetStatus) resetStatus.textContent = ""; }, 6000);
          } catch (err) {
            if (resetStatus) resetStatus.textContent = "Failed to send reset";
            alert(err.message || "Failed to send reset link.");
          } finally {
            resetBtn.disabled = false;
          }
        });
      }
    } catch (err) {
      console.error("Failed to load user:", err);
      alert("Error loading user: " + err.message);
    }
  }

  // logout + force sign-out watcher
  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => (window.location.href = "index.html"));
  });

  (async () => {
    const token = localStorage.getItem("boop_jwt");
    if (!token) return;
    try {
      const res = await fetch("/api/me", { method: "GET", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const me = await res.json();
      if (me.force_signed_out) {
        alert("You have been signed out by an administrator.");
        localStorage.clear();
        try {
          const sessionRes = await fetch(`/api/sessions/${me.email}`, { method: "DELETE" });
          if (sessionRes.status !== 200 && sessionRes.status !== 404) console.warn("Session deletion failed:", await sessionRes.text());
        } catch {}
        window.location.href = "../government-portal.html";
      }
    } catch {}
  })();

  // initial load + pagination
  loadUserProfile();
  document.getElementById("nextTransactions")?.addEventListener("click", () => { currentPage++; loadUserProfile(); });
  document.getElementById("prevTransactions")?.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadUserProfile(); } });

  // modal for notes
  function showNote(noteText) {
    const modal = document.createElement("div");
    Object.assign(modal.style, {
      position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "9999",
    });
    const box = document.createElement("div");
    Object.assign(box.style, {
      background: "#fff", padding: "20px", borderRadius: "8px", maxWidth: "400px", boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
    });
    box.innerHTML = `
      <h3>Transaction Note</h3>
      <p style="white-space: pre-wrap;">${noteText}</p>
      <button style="margin-top: 20px;" onclick="this.closest('div').parentNode.remove()">Close</button>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);
  }
});
