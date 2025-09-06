let currentPage = 1;
const transactionsPerPage = 10;

// --- helper: build Passport link for NFC/cards
function buildPassportLink(pidToken) {
  if (!pidToken) return "";
  // Always point to passport page; adjust path if different
  return `${location.origin}/passport/index.html?pid=${encodeURIComponent(pidToken)}`;
}

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
  const parentNameEl = document.getElementById("parentName");
  const parentEmailEl = document.getElementById("parentEmail");

let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");

// Remove any accidental whitespace or malformed characters from UUID
currentUserId = currentUserId?.replace(/\s+/g, ''); 
  let currentUserData = null;
  let isEditMode = false;

  if (!currentUserId) {
    alert("User ID not found.");
    window.location.href = "view-users.html";
  }

  async function fetchJSON(url, options = {}) {
  const token = localStorage.getItem("boop_jwt");

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (options.autoRedirect !== false) {
    window.location.href = "../government-portal.html";
    return;
  }

  const fetchOptions = {
    ...options,
    headers,
  };

  const res = await fetch(url, fetchOptions);

  if (res.status === 401 || res.status === 403) {
    console.warn("⚠️ Token rejected or expired");
    if (options.autoRedirect !== false) {
      window.location.href = "../government-portal.html";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Network error");
  }

  return await res.json();
}

  function formatDatePretty(dateStr) {
    const date = new Date(dateStr);
    const options = { year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString("en-US", options);
  }

    async function loadUserProfile() {
    try {
      console.log("🔍 Loading user with ID:", currentUserId);
let user;
try {
  user = await fetchJSON(`/api/users/${currentUserId}`);
  console.log("✅ User loaded:", user);
} catch (err) {
  console.error("❌ Error during fetchJSON:", err.message);
  throw err;
}
      currentUserData = user;


      let walletHTML = "";

// All Cards: Transit & Spending (safely skip for users with no wallet)
if (user.wallet_id || user.wallet?.id) {
  try {
let allCards = [];

if (user.wallet_id || user.wallet?.id) {
  try {
    allCards = await fetchJSON(`/api/cards?wallet_id=${user.wallet_id || user.wallet?.id}`);
  } catch (err) {
    console.warn("🟡 Failed to load cards:", err.message);
  }
} else {
  console.info("Skipping card fetch — user has no wallet.");
}
    const transitCards = allCards.filter(c => c.type === "transit");
    const spendingCards = allCards.filter(c => c.type === "spending");

    // Show Transit Cards
    if (transitCards.length > 0) {
      transitCards.forEach(card => {
        walletHTML += `<div><span class="label">Transit Card</span><span class="value">${card.uid}</span></div>`;
      });
    } else {
      walletHTML += `<div><span class="label">Transit Card</span><span class="value">None</span></div>`;
    }

    // Show Spending Card (optional)
    if (spendingCards.length > 0) {
      spendingCards.forEach(card => {
        walletHTML += `<div><span class="label">Spending Card</span><span class="value">${card.uid}</span></div>`;
      });
    }
  } catch (err) {
    console.warn("Failed to load cards:", err.message);
    walletHTML += `<div><span class="label">Cards</span><span class="value">Failed to load</span></div>`;
  }
} else {
  walletHTML += `<div><span class="label">Cards</span><span class="value">Not applicable</span></div>`;
}
let assistanceHTML = "";
if (
  (user.wallet || user.wallet_id) &&
  (user.role === "cardholder" || user.role === "senior")
) {
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

  // Prefer balance_cents; fall back to balance (which is also cents in your DB)
  const cents = Number(
    w?.balance_cents ??
    w?.balance ??
    w?.wallet?.balance_cents ??
    w?.wallet?.balance ??
    0
  );

  if (Number.isFinite(cents)) {
    walletBalance = `$${(cents / 100).toFixed(2)}`;
  }
} catch (err) {
  console.warn("Could not load wallet balance:", err.message);
}
      
userInfo.innerHTML = `
  <div><span class="label">User ID</span><span class="value">${user.id}</span></div>
  
  <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.first_name}</span>
    <input type="text" id="editFirstName" value="${user.first_name}" style="display:none; width: 100%;" /></div>

  <div><span class="label">Middle Name</span><span class="value" id="viewMiddleName">${user.middle_name || "-"}</span>
    <input type="text" id="editMiddleName" value="${user.middle_name || ""}" style="display:none; width: 100%;" /></div>

  <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.last_name}</span>
    <input type="text" id="editLastName" value="${user.last_name}" style="display:none; width: 100%;" /></div>

  <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email}</span>
    <input type="email" id="editEmail" value="${user.email}" style="display:none; width: 100%;" /></div>
  <!-- Passport (admin-managed) -->
  <div>
    <span class="label">Passport ID</span>
    <span class="value" id="viewPassportId">—</span>
    <input
      type="text"
      id="editPassportId"
      style="display:none; width: 100%;"
      placeholder="Enter passport ID (e.g., ABCD-1234)"
    />
  </div>

  <div>
    <span class="label">Passport Link</span>
    <span class="value">
      <a id="viewPassportLink" href="#" target="_blank" rel="noopener">—</a>
      <button id="copyPassportLinkBtn" class="btn-secondary" style="margin-left:8px;">Copy</button>
    </span>
  </div>
  <div><span class="label">Status</span><span class="value" style="color:${user.status === "suspended" ? "red" : "green"}">${user.status}</span></div>

  <div><span class="label">Role</span><span class="value">${user.role}</span></div>

  <div><span class="label">Balance</span><span class="value">${walletBalance}</span></div>
  
  ${assistanceHTML} 

  ${walletHTML}
`;

      // ─── PASSPORT: fetch + populate + copy link ────────────────────────────────
try {
  // Elements we just added in the HTML template
  const viewPidEl   = document.getElementById("viewPassportId");
  const editPidEl   = document.getElementById("editPassportId");
  const linkEl      = document.getElementById("viewPassportLink");
  const copyBtnEl   = document.getElementById("copyPassportLinkBtn");

  // Build a base origin (uses current site; falls back to production)
  const ORIGIN = (location && location.origin) ? location.origin : "https://payulot.com";

  // GET admin view of this user’s passport
  // (Endpoint from earlier step: GET /api/admin/users/:id/passport → { passport_id } | {} )
  const pp = await fetchJSON(`/api/admin/users/${user.id}/passport`);
  const passportId = (pp && pp.passport_id) ? String(pp.passport_id) : "";

  // Fill display + edit fields
  if (viewPidEl) viewPidEl.textContent = passportId || "—";
  if (editPidEl) editPidEl.value = passportId;

  // Build deep link (tap target): https://<origin>/passport/?pid=<passportId>
  const deepLink = passportId ? `${ORIGIN}/passport/?pid=${encodeURIComponent(passportId)}` : "#";

  if (linkEl) {
    linkEl.href = deepLink;
    linkEl.textContent = passportId ? deepLink : "—";
  }

  // Copy button
  if (copyBtnEl) {
    copyBtnEl.addEventListener("click", async () => {
      try {
        if (!passportId) {
          alert("No Passport ID set for this user yet.");
          return;
        }
        await navigator.clipboard.writeText(deepLink);
        const old = copyBtnEl.textContent;
        copyBtnEl.textContent = "Copied!";
        setTimeout(() => (copyBtnEl.textContent = old), 1200);
      } catch (err) {
        alert("Copy failed. You can manually copy the link shown.");
      }
    });
  }
} catch (err) {
  console.warn("Passport fetch failed:", err?.message || err);
  const viewPidEl = document.getElementById("viewPassportId");
  const linkEl    = document.getElementById("viewPassportLink");
  if (viewPidEl) viewPidEl.textContent = "—";
  if (linkEl) {
    linkEl.removeAttribute("href");
    linkEl.textContent = "—";
  }
}
// ───────────────────────────────────────────────────────────────────────────
      
console.log("Attempting to load transactions for user:", user.id);

const transactionTableBody = document.querySelector("#transactionTable tbody");
if (!transactionTableBody) {
  console.error("Transaction table body not found in DOM");
  return; // Stop here but don't throw to avoid breaking profile
}

transactionTableBody.innerHTML = "";

let transactions = [];

try {
  const offset = (currentPage - 1) * transactionsPerPage;
  const res = await fetchJSON(`/api/transactions/user/${user.id}?limit=${transactionsPerPage + 1}&offset=${offset}`);
  transactions = res.transactions || [];
  console.log("💳 Loaded transactions:", transactions);
} catch (err) {
  console.error("Failed to fetch transactions:", err.message);
}

const pageTransactions = transactions.slice(0, transactionsPerPage);

if (pageTransactions.length === 0) {
  transactionTableBody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; padding: 20px; color: #888;">
        No transactions recorded.
      </td>
    </tr>
  `;
} else {
  for (const tx of pageTransactions) {
    const createdAt = tx.created_at ? new Date(tx.created_at).toLocaleString() : "-";
    const amount = typeof tx.amount_cents === "number"
      ? `$${(tx.amount_cents / 100).toFixed(2)}`
      : "-";
    const isCredit = tx.type === "credit";
let direction = "-";
let name = "-";

if (isCredit) {
  direction = "Received";
  name = tx.counterparty_name === `${currentUserData.first_name} ${currentUserData.last_name}`
    ? "From Government"
    : `From ${tx.counterparty_name}`;
} else if (tx.type === "debit") {
  direction = "Sent";
  name = tx.counterparty_name === `${currentUserData.first_name} ${currentUserData.last_name}`
    ? "To Government"
    : `To ${tx.counterparty_name}`;
} else {
  direction = tx.type || "-";
  name = "Unknown";
}
    const noteBtn = typeof tx.note === "string" && tx.note
      ? `<button class="btn-view-note" data-note="${tx.note.replace(/"/g, '&quot;')}">View</button>`
      : "-";
    const id = tx.id || "-";

    try {
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
    } catch (err) {
      console.error("❌ Error creating transaction row:", err.message, tx);
    }
  }
}

try {
  document.querySelectorAll(".btn-view-note").forEach(button => {
    button.addEventListener("click", () => {
      const noteText = button.dataset.note || "";
      showNote(noteText);
    });
  });
} catch (err) {
  console.error("Error attaching note button listeners:", err.message);
}  

// === PAGINATION CONTROLS ===
const pageIndicator = document.getElementById("transactionPageIndicator");
const prevBtn = document.getElementById("prevTransactions");
const nextBtn = document.getElementById("nextTransactions");

if (pageIndicator) {
  pageIndicator.textContent = `Page ${currentPage}`;
}
if (prevBtn) {
  prevBtn.style.display = currentPage === 1 ? "none" : "inline-block";
}
if (nextBtn) {
  nextBtn.style.display = transactions.length > transactionsPerPage ? "inline-block" : "none";
}

// Restore assist dropdown logic
const assistDropdown = document.getElementById("editAssistance");
if (assistDropdown) {
  assistDropdown.value = user.on_assistance ? "true" : "false";
}

      // dropdown

const dropdown = document.createElement("select");
dropdown.innerHTML = `
  <option value="">Actions</option>
  <option value="${user.status === "suspended" ? "unsuspend" : "suspend"}">${user.status === "suspended" ? "Unsuspend" : "Suspend"}</option>
  <option value="signout">Force Sign-out</option>
  <option value="delete">Delete</option>
`;
dropdown.addEventListener("change", async () => {
  const action = dropdown.value;
  dropdown.value = "";
  if (!action) return;

  const token = localStorage.getItem("boop_jwt");
  if (!token) {
    alert("Missing token.");
    return;
  }

  // Load current user info for email (like View Users does)
  let adminUser = null;
  try {
    const meRes = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    adminUser = await meRes.json();
  } catch (e) {
    console.warn("Failed to fetch current admin");
  }

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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update status");
      }

      alert(`User status updated to ${newStatus}.`);

      if (newStatus === "suspended") {
        await fetch(`/api/users/${currentUserId}/signout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }

    } else if (action === "signout") {
      res = await fetch(`/api/users/${currentUserId}/signout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Force sign-out failed");
      }

      alert("User signed out.");

    } else if (action === "delete") {
      res = await fetch(`/api/users/${currentUserId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ uid: adminUser?.id }) // Just in case the backend checks this
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "User deletion failed");
      }

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

// === Student View ===
if (user.role === "student") {
  const s = user.student_profile;

  if (s) {
    studentInfoSection.innerHTML = `
      <div class="section-title">Student Info</div>

      <div style="margin-top: 10px; margin-bottom: 10px;">
        <button id="editStudentBtn" class="btnEdit">Edit Student</button>
        <button id="saveStudentBtn" class="btnEdit" style="display:none;">Save Student Info</button>
      </div>

      <div class="user-details-grid">
        <div>
          <span class="label">School</span>
          <span class="value" id="viewSchool">${s.school_name || "-"}</span>
          <input type="text" id="editSchool" value="${s.school_name || ""}" style="display:none; width: 100%;" />
        </div>

        <div>
          <span class="label">Grade</span>
          <span class="value" id="viewGrade">${s.grade_level || "-"}</span>
          <input type="text" id="editGrade" value="${s.grade_level || ""}" style="display:none; width: 100%;" />
        </div>

        <div>
          <span class="label">Expiry</span>
          <span class="value" id="viewExpiry">${s.expiry_date ? formatDatePretty(s.expiry_date) : "-"}</span>
          <input type="date" id="editExpiry" value="${s.expiry_date ? s.expiry_date.slice(0, 10) : ""}" style="display:none; width: 100%;" />
        </div>
      </div>
    `;

    studentInfoSection.style.display = "block";

    // Attach Edit + Save handlers
    const editStudentBtn = document.getElementById("editStudentBtn");
    const saveStudentBtn = document.getElementById("saveStudentBtn");

    if (editStudentBtn) {
      editStudentBtn.onclick = () => {
        ["School", "Grade", "Expiry"].forEach(field => {
          const viewEl = document.getElementById(`view${field}`);
          const editEl = document.getElementById(`edit${field}`);
          if (viewEl && editEl) {
            viewEl.style.display = "none";
            editEl.style.display = "block";
          }
        });

        if (saveStudentBtn) {
          saveStudentBtn.style.display = "inline-block";
        }
      };
    }

    if (saveStudentBtn) {
      saveStudentBtn.onclick = async () => {
        const studentData = {
          school_name: document.getElementById("editSchool")?.value,
          grade_level: document.getElementById("editGrade")?.value,
          expiry_date: document.getElementById("editExpiry")?.value,
        };

        console.log("PATCHing to:", `/api/students/${currentUserId}`);

        try {
          await fetchJSON(`/api/students/${currentUserId}`, {
            method: "PATCH",
            body: JSON.stringify(studentData)
          });

          alert("✅ Student info saved.");
          isEditMode = false;
          saveStudentBtn.style.display = "none";
          loadUserProfile();
        } catch (err) {
          console.error("Failed to save student data:", err);
          alert("Failed to save student info.");
        }
      };
    }

    // Fetch and display parent info
    try {
      const parents = await fetchJSON(`/api/user-students/parents/${user.id}`);

      if (Array.isArray(parents) && parents.length > 0) {
        const parent = parents[0]; // change if multiple supported

        document.getElementById("parentName").innerHTML = `
          <a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${parent.id}')">
            ${parent.first_name} ${parent.last_name}
          </a>
        `;
        document.getElementById("parentEmail").textContent = parent.email;
        document.getElementById("parentSection").style.display = "block";
      }
    } catch (err) {
      console.warn("Could not load parent info:", err.message);
    }
  }
}
      
// === Parent View ===
if (user.role === "parent" && Array.isArray(user.assigned_students)) {
  studentInfoSection.innerHTML = `
    <div class="section-title">Assigned Students</div>
  `;

  user.assigned_students.forEach(student => {
    const block = document.createElement("div");
    block.classList.add("user-details-grid");

    block.innerHTML = `
      <div><span class="label">Name</span><span class="value">
        <a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${student.id}')">
          ${student.first_name} ${student.last_name}
        </a></span></div>
      <div><span class="label">Email</span><span class="value">${student.email}</span></div>
      <div><span class="label">School</span><span class="value">${student.school_name || "-"}</span></div>
      <div><span class="label">Grade</span><span class="value">${student.grade_level || "-"}</span></div>
      <div><span class="label">Expiry</span><span class="value">${student.expiry_date ? formatDatePretty(student.expiry_date) : "-"}</span></div>
    `;

    studentInfoSection.appendChild(block);
  });

  studentInfoSection.style.display = "block";
}
      
      // === Edit Profile Setup ===
editBtn.onclick = () => {
  isEditMode = true;

  // Toggle user input fields
  ["FirstName", "MiddleName", "LastName", "Email", "Assistance"].forEach(field => {
    const viewEl = document.getElementById(`view${field}`);
    const editEl = document.getElementById(`edit${field}`);
    if (viewEl && editEl) {
      viewEl.style.display = "none";
      editEl.style.display = "block";
    }
  });

  

  // Toggle vendor input fields
  if (currentUserData.role === "vendor") {
    ["Business", "Category", "Phone", "VendorApproved"].forEach(field => {
      const viewEl = document.getElementById(`vendor${field}`) || document.getElementById(`view${field}`);
      const editEl = document.getElementById(`editVendor${field}`) || document.getElementById(`edit${field}`);
      if (viewEl && editEl) {
        viewEl.style.display = "none";
        editEl.style.display = "block";
      }
    });
  }

  // Show save button
  saveBtn.style.display = "inline-block";

  // Show remove buttons for parents
  document.querySelectorAll(".remove-student-wrapper").forEach(el => {
    el.style.display = "block";
  });
};

saveBtn.onclick = async () => {
  let hadError = false;

  // Update user base info
  try {
    await fetchJSON(`/api/users/${currentUserId}`, {
      method: "PATCH",
      body: JSON.stringify({
        first_name: document.getElementById("editFirstName").value,
        middle_name: document.getElementById("editMiddleName").value,
        last_name: document.getElementById("editLastName").value,
        email: document.getElementById("editEmail").value,
        on_assistance: (() => {
  const el = document.getElementById("editAssistance");
  return el ? el.value === "true" : false;
})()
      })
    });
  } catch (err) {
    hadError = true;
    console.warn("User update failed:", err);
  }

  

  // Vendor update
  if (currentUserData.role === "vendor") {
    try {
      await fetchJSON(`/api/vendors/${currentUserId}`, {
        method: "PATCH",
        body: JSON.stringify({
          business_name: document.getElementById("editVendorBusiness")?.value,
          category: document.getElementById("editVendorCategory")?.value,
          phone: document.getElementById("editVendorPhone")?.value,
        })
      });
    } catch (err) {
      hadError = true;
      console.warn("Vendor update failed:", err);
    }
  }

  // ✅ Final outcome
  if (hadError) {
    alert("Some changes were saved, but not all.");
  } else {
    alert("All changes saved.");
    isEditMode = false;
    saveBtn.style.display = "none";

    [
      "FirstName", "MiddleName", "LastName", "Email", "Assistance",
      "School", "Grade", "Expiry",
      "Business", "Category", "Phone", "VendorApproved"
    ].forEach(field => {
      const viewEl = document.getElementById(`view${field}`) || document.getElementById(`vendor${field}`);
      const editEl = document.getElementById(`edit${field}`) || document.getElementById(`editVendor${field}`);
      if (viewEl && editEl) {
        viewEl.style.display = "inline-block";
        editEl.style.display = "none";
      }
    });

    document.querySelectorAll(".remove-student-wrapper").forEach(el => {
      el.style.display = "none";
    });

    loadUserProfile();
  }
};
    
      

    } catch (err) {
  console.error("Failed to load user:", err);
  alert("Error loading user: " + err.message);
}
  }

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });
isEditMode = false;

// ✅ Check if current user has been force signed out
(async () => {
  const token = localStorage.getItem("boop_jwt");
  if (!token) return;

  try {
    const res = await fetch("/api/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;

    const user = await res.json();

    if (user.force_signed_out) {
      alert("You have been signed out by an administrator.");
      localStorage.clear();

      try {
        const sessionRes = await fetch(`/api/sessions/${user.email}`, { method: "DELETE" });

        // ignore 404 (session already gone)
        if (sessionRes.status !== 200 && sessionRes.status !== 404) {
          console.warn("🧹 Session deletion failed:", await sessionRes.text());
        }
      } catch (err) {
        console.warn("🧹 Session cleanup failed:", err);
      }

      window.location.href = "login.html";
    }
  } catch (err) {
    console.error("Force sign-out check failed:", err);
  }
})();

  
  loadUserProfile();


document.getElementById("nextTransactions")?.addEventListener("click", () => {
  currentPage++;
  loadUserProfile();
});

document.getElementById("prevTransactions")?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    loadUserProfile();
  }
});
  

 function showNote(noteText) {
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.background = "rgba(0, 0, 0, 0.6)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "9999";

  const box = document.createElement("div");
  box.style.background = "#fff";
  box.style.padding = "20px";
  box.style.borderRadius = "8px";
  box.style.maxWidth = "400px";
  box.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.3)";
  box.innerHTML = `
    <h3>Transaction Note</h3>
    <p style="white-space: pre-wrap;">${noteText}</p>
    <button style="margin-top: 20px;" onclick="this.closest('div').parentNode.remove()">Close</button>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);
}

  });
