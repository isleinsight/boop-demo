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
  const parentSection = document.getElementById("parentSection");
  const studentInfoSection = document.getElementById("studentInfoSection");

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  currentUserId = currentUserId?.replace(/\s+/g, '');
  let currentUserData = null;
  let isEditMode = false;

  if (!currentUserId) {
    alert("User ID not found.");
    window.location.href = "view-users.html";
  }

  async function fetchJSON(url, options = {}) {
    const token = localStorage.getItem("boop_jwt");
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else if (options.autoRedirect !== false) {
      window.location.href = "../government-portal.html";
      return;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      if (options.autoRedirect !== false) window.location.href = "../government-portal.html";
      throw new Error("Unauthorized");
    }
    if (!res.ok) throw new Error(await res.text() || "Network error");
    return await res.json();
  }

  function formatDatePretty(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function setTapStatus(msg, isError = false) {
    const el = document.getElementById("tapLinkStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#b91c1c" : "#6b7280";
  }
  function ensurePassportSection() {
    // If static HTML exists, just return it
    let section = document.getElementById("passportSection");
    if (section) return section;

    const page = document.querySelector('.user-profile-page');
    if (!page) return null;

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'section-title';
    sectionTitle.textContent = 'Passport';

    section = document.createElement('div');
    section.className = 'user-details-grid';
    section.id = 'passportSection';
    section.innerHTML = `
      <div>
        <span class="label">Tap Link</span>
        <span class="value" id="passportTapLinkValue">Loading…</span>
        <input type="text" id="passportTapLinkInput" style="display:none; width:100%;" readonly />
      </div>
      <div>
        <span class="label">Actions</span>
        <div class="value">
          <button id="copyTapLinkBtn" class="btnEdit" disabled>Copy</button>
          <span id="tapLinkStatus" style="margin-left:8px;color:#6b7280;"></span>
        </div>
      </div>`;

    // Insert before Transaction History heading if present
    const txnTitle = Array.from(page.querySelectorAll('.section-title')).find(el => el.textContent.trim() === 'Transaction History');
    if (txnTitle) {
      page.insertBefore(sectionTitle, txnTitle);
      page.insertBefore(section, txnTitle);
    } else {
      page.appendChild(sectionTitle);
      page.appendChild(section);
    }
    return section;
  }

  async function loadPassport(userId) {
    const valueSpan = document.getElementById("passportTapLinkValue");
    const input = document.getElementById("passportTapLinkInput");
    const copyBtn = document.getElementById("copyTapLinkBtn");
    if (!valueSpan || !copyBtn) return;

    valueSpan.textContent = "Loading…";
    if (input) input.style.display = "none";
    copyBtn.disabled = true;
    setTapStatus("");

    try {
      const data = await fetchJSON(`/api/passport/${encodeURIComponent(userId)}`);
      const passportId = data?.passportId ?? data?.passport_id;
      if (!passportId) {
        valueSpan.textContent = "No passport assigned";
        setTapStatus("Assign a passport ID to generate the tap link.", true);
        return;
      }
      const tapLink = `https://payulot.com/tap.html?pid=${encodeURIComponent(passportId)}`;
      valueSpan.textContent = tapLink;
      if (input) input.value = tapLink;

      const newBtn = copyBtn.cloneNode(true);
      copyBtn.parentNode.replaceChild(newBtn, copyBtn);
      newBtn.disabled = false;
      newBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(tapLink);
          setTapStatus("Copied to clipboard.");
        } catch {
          setTapStatus("Copy failed. Select and copy manually.", true);
          if (input) {
            input.style.display = "block";
            input.focus();
            input.select();
          }
        }
      });
    } catch (err) {
      valueSpan.textContent = "Error loading Tap Link";
      setTapStatus(err.message || "Failed to load tap link", true);
    }
  }

  async function loadUserProfile() {
    try {
      const user = await fetchJSON(`/api/users/${currentUserId}`);
      currentUserData = user;

      // build wallet info
      let walletHTML = "";
      if (user.wallet_id || user.wallet?.id) {
        try {
          const allCards = await fetchJSON(`/api/cards?wallet_id=${user.wallet_id || user.wallet?.id}`);
          const transitCards = allCards.filter(c => c.type === "transit");
          const spendingCards = allCards.filter(c => c.type === "spending");
          if (transitCards.length > 0) transitCards.forEach(c => walletHTML += `<div><span class="label">Transit Card</span><span class="value">${c.uid}</span></div>`);
          else walletHTML += `<div><span class="label">Transit Card</span><span class="value">None</span></div>`;
          if (spendingCards.length > 0) spendingCards.forEach(c => walletHTML += `<div><span class="label">Spending Card</span><span class="value">${c.uid}</span></div>`);
        } catch { walletHTML += `<div><span class="label">Cards</span><span class="value">Failed to load</span></div>`; }
      } else walletHTML += `<div><span class="label">Cards</span><span class="value">Not applicable</span></div>`;

      let assistanceHTML = "";
      if ((user.wallet || user.wallet_id) && ["cardholder","senior"].includes(user.role)) {
        assistanceHTML = `
          <div>
            <span class="label">On Assistance</span>
            <span class="value" id="viewAssistance">${user.on_assistance ? "Yes" : "No"}</span>
            <select id="editAssistance" style="display:none; width:100%;">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>`;
      }

      let walletBalance = "N/A";
      try {
        const w = await fetchJSON(`/api/wallets/user/${user.id}`);
        const cents = Number(w?.balance_cents ?? w?.balance ?? w?.wallet?.balance_cents ?? w?.wallet?.balance ?? 0);
        if (Number.isFinite(cents)) walletBalance = `$${(cents/100).toFixed(2)}`;
      } catch {}

      userInfo.innerHTML = `
        <div><span class="label">User ID</span><span class="value">${user.id}</span></div>
        <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.first_name}</span>
          <input type="text" id="editFirstName" value="${user.first_name}" style="display:none;width:100%;"/></div>
        <div><span class="label">Middle Name</span><span class="value" id="viewMiddleName">${user.middle_name || "-"}</span>
          <input type="text" id="editMiddleName" value="${user.middle_name || ""}" style="display:none;width:100%;"/></div>
        <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.last_name}</span>
          <input type="text" id="editLastName" value="${user.last_name}" style="display:none;width:100%;"/></div>
        <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email}</span>
          <input type="email" id="editEmail" value="${user.email}" style="display:none;width:100%;"/></div>
        <div><span class="label">Status</span><span class="value" style="color:${user.status === "suspended" ? "red" : "green"}">${user.status}</span></div>
        <div><span class="label">Role</span><span class="value">${user.role}</span></div>
        <div><span class="label">Balance</span><span class="value">${walletBalance}</span></div>
        ${assistanceHTML}${walletHTML}`;

      await loadPassport(user.id);

      // (transactions + rest of your logic remains unchanged)
      // ... existing transaction table code ...

    } catch (err) {
      alert("Error loading user: " + err.message);
    }
  }

  // other existing event handlers (edit/save/reset/etc.) remain unchanged

  loadUserProfile();

  document.getElementById("nextTransactions")?.addEventListener("click", () => { currentPage++; loadUserProfile(); });
  document.getElementById("prevTransactions")?.addEventListener("click", () => { if(currentPage>1){currentPage--;loadUserProfile();} });
});
