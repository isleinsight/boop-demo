let currentPage = 1;
const transactionsPerPage = 10;

/* -------------------------------------------
   Helpers
------------------------------------------- */
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
    throw new Error("Unauthorized");
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    console.warn("Token rejected or expired");
    if (options.autoRedirect !== false) {
      window.location.href = "../government-portal.html";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `HTTP ${res.status}`);
  }

  try {
    return await res.json();
  } catch {
    return {};
  }
}

function formatDatePretty(dateStr) {
  const date = new Date(dateStr);
  const options = { year: "numeric", month: "long", day: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

/* -------------------------------------------
   Main
------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const parentSection = document.getElementById("parentSection");
  const studentInfoSection = document.getElementById("studentInfoSection");

  const currentAdmin = JSON.parse(localStorage.getItem("boopUser") || "null");
  if (currentAdmin?.role === "admin" && ["viewer", "accountant"].includes(currentAdmin?.type)) {
    if (editBtn) editBtn.style.display = "none";
  }

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

  /* -------------------------------------------
     Load profile (render + data fetches)
  ------------------------------------------- */
  async function loadUserProfile() {
    try {
      // 1) Base user
      const user = await fetchJSON(`/api/users/${currentUserId}`);
      currentUserData = user;

       // ---- Fill the existing "Passport link" input using this user's passport_id ----
(async () => {
  const input = document.getElementById("passportLink");
  const copyBtn = document.getElementById("copyPassportLink");
  if (!input) return;

  input.value = "Loading…";

  try {
    // IMPORTANT: this matches your backend route:
    // router.get("/admin/:userId", ...) inside backend/auth/routes/passport.js
    const token = localStorage.getItem("boop_jwt");
    const res = await fetch(`/api/passport/admin/${encodeURIComponent(user.id)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    // If server ever returns non-JSON (e.g., error HTML), avoid crashing:
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}

    const pid = data?.passport_id || "";

    if (!res.ok || !pid) {
      input.value = "No passport assigned";
      return;
    }

    // Build the NFC deep link exactly like you want:
    input.value = `https://payulot.com/tap.html?pid=${encodeURIComponent(pid)}`;

    // Wire up the Copy button once
    if (copyBtn && !copyBtn._wired) {
      copyBtn._wired = true;
      copyBtn.addEventListener("click", async () => {
        const val = input.value || "";
        if (!val || val === "No passport assigned") {
          alert("No passport link to copy.");
          return;
        }
        try {
          await navigator.clipboard.writeText(val);
          const old = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          setTimeout(() => (copyBtn.textContent = old), 1200);
        } catch {
          input.select();
          document.execCommand("copy");
          const old = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          setTimeout(() => (copyBtn.textContent = old), 1200);
        }
      });
    }
  } catch (e) {
    console.warn("Passport populate error:", e);
    input.value = "No passport assigned";
  }
})();

      // 2) Wallet balance
      let walletBalance = "N/A";
      try {
        const w = await fetchJSON(`/api/wallets/user/${user.id}`);
        const cents = Number(
          w?.balance_cents ??
          w?.balance ??
          w?.wallet?.balance_cents ??
          w?.wallet?.balance ??
          0
        );
        if (Number.isFinite(cents)) walletBalance = `$${(cents / 100).toFixed(2)}`;
      } catch (err) {
        console.warn("Could not load wallet balance:", err.message);
      }

      // 3) Cards (transit/spending)
      let walletHTML = "";
      if (user.wallet_id || user.wallet?.id) {
        try {
          const allCards = await fetchJSON(`/api/cards?wallet_id=${user.wallet_id || user.wallet?.id}`);
          const transitCards = allCards.filter(c => c.type === "transit");
          const spendingCards = allCards.filter(c => c.type === "spending");

          if (transitCards.length) {
            transitCards.forEach(card => {
              walletHTML += `<div><span class="label">Transit Card</span><span class="value">${card.uid}</span></div>`;
            });
          } else {
            walletHTML += `<div><span class="label">Transit Card</span><span class="value">None</span></div>`;
          }

          if (spendingCards.length) {
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

      // 4) Assistance field only for cardholder/senior with wallet
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

      // 5) Render main details (includes the Passport deep-link row)
      userInfo.innerHTML = `
        <div><span class="label">User ID</span><span class="value">${user.id}</span></div>

        <div>
          <span class="label">First Name</span>
          <span class="value" id="viewFirstName">${user.first_name}</span>
          <input type="text" id="editFirstName" value="${user.first_name}" style="display:none; width: 100%;" />
        </div>

        <div>
          <span class="label">Middle Name</span>
          <span class="value" id="viewMiddleName">${user.middle_name || "-"}</span>
          <input type="text" id="editMiddleName" value="${user.middle_name || ""}" style="display:none; width: 100%;" />
        </div>

        <div>
          <span class="label">Last Name</span>
          <span class="value" id="viewLastName">${user.last_name}</span>
          <input type="text" id="editLastName" value="${user.last_name}" style="display:none; width: 100%;" />
        </div>

        <div>
          <span class="label">Email</span>
          <span class="value" id="viewEmail">${user.email}</span>
          <input type="email" id="editEmail" value="${user.email}" style="display:none; width: 100%;" />
        </div>

        <!-- Passport deep link (for NFC cards) -->
        <div class="passport-link-row" style="display:flex; gap:10px; align-items:center;">
          <div style="flex:1">
            <span class="label">Passport deep link</span>
            <input
              type="text"
              id="passportLink"
              readonly
              style="width:100%; background:#f9fafb; border:1px solid #d1d9e6; padding:10px 12px; border-radius:6px;"
              value="Loading…"
            />
          </div>
          <button id="copyPassportLink" class="btnEdit" type="button">Copy</button>
        </div>

        <div>
          <span class="label">Status</span>
          <span class="value" style="color:${user.status === "suspended" ? "red" : "green"}">${user.status}</span>
        </div>

        <div><span class="label">Role</span><span class="value">${user.role}</span></div>
        <div><span class="label">Balance</span><span class="value">${walletBalance}</span></div>

        ${assistanceHTML}
        ${walletHTML}
      `;

      // 6) Populate Passport deep link
      currentUserData._passport_id = ""; // track current for save comparison
      try {
        const pp = await fetchJSON(`/api/passport/admin/${user.id}`);
        const passportId = (pp && pp.passport_id) ? String(pp.passport_id) : "";
        currentUserData._passport_id = passportId;

        const input = document.getElementById("passportLink");
        if (input) {
          if (passportId) {
            const deepLink = `${location.origin}/tap.html?pid=${encodeURIComponent(passportId)}`;
            input.value = deepLink;
          } else {
            input.value = "No passport assigned";
          }
        }
      } catch (e) {
        const input = document.getElementById("passportLink");
        if (input) input.value = "No passport assigned";
        console.warn("Could not populate passport link:", e?.message || e);
      }

      // 7) Copy passport link
      (() => {
        const copyBtn = document.getElementById("copyPassportLink");
        if (!copyBtn) return;
        copyBtn.addEventListener("click", async () => {
          const val = document.getElementById("passportLink")?.value || "";
          if (!val || val === "No passport assigned") {
            alert("No passport link to copy.");
            return;
          }
          try {
            await navigator.clipboard.writeText(val);
            copyBtn.textContent = "Copied!";
            setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
          } catch {
            const inp = document.getElementById("passportLink");
            inp?.select();
            document.execCommand("copy");
            copyBtn.textContent = "Copied!";
            setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
          }
        });
      })();

      // 8) Transactions
      const transactionTableBody = document.querySelector("#transactionTable tbody");
      if (!transactionTableBody) {
        console.error("Transaction table body not found in DOM");
        return;
      }
      transactionTableBody.innerHTML = "";

      let transactions = [];
      try {
        const offset = (currentPage - 1) * transactionsPerPage;
        const res = await fetchJSON(
          `/api/transactions/user/${user.id}?limit=${transactionsPerPage + 1}&offset=${offset}`
        );
        transactions = res.transactions || [];
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
          const direction = isCredit ? "Received" : tx.type === "debit" ? "Sent" : tx.type || "-";
          const counterparty = tx.counterparty_name || "Unknown";
          const name = isCredit ? `From ${counterparty}` : `To ${counterparty}`;
          const noteBtn = typeof tx.note === "string" && tx.note
            ? `<button class="btn-view-note" data-note="${tx.note.replace(/"/g, '&quot;')}">View</button>`
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

      // Attach note viewers
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

      // Pagination controls
      const pageIndicator = document.getElementById("transactionPageIndicator");
      const prevBtn = document.getElementById("prevTransactions");
      const nextBtn = document.getElementById("nextTransactions");

      if (pageIndicator) pageIndicator.textContent = `Page ${currentPage}`;
      if (prevBtn) prevBtn.style.display = currentPage === 1 ? "none" : "inline-block";
      if (nextBtn) nextBtn.style.display = transactions.length > transactionsPerPage ? "inline-block" : "none";

      const assistDropdown = document.getElementById("editAssistance");
      if (assistDropdown) assistDropdown.value = user.on_assistance ? "true" : "false";

      // Actions dropdown (suspend/signout/delete)
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
        if (!token) {
          alert("Missing token.");
          return;
        }

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
              body: JSON.stringify({ uid: adminUser?.id })
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

      // Student view
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
              if (saveStudentBtn) saveStudentBtn.style.display = "inline-block";
            };
          }

          if (saveStudentBtn) {
            saveStudentBtn.onclick = async () => {
              const studentData = {
                school_name: document.getElementById("editSchool")?.value,
                grade_level: document.getElementById("editGrade")?.value,
                expiry_date: document.getElementById("editExpiry")?.value,
              };
              try {
                await fetchJSON(`/api/students/${currentUserId}`, {
                  method: "PATCH",
                  body: JSON.stringify(studentData)
                });
                alert("Student info saved.");
                isEditMode = false;
                saveStudentBtn.style.display = "none";
                loadUserProfile();
              } catch (err) {
                console.error("Failed to save student data:", err);
                alert("Failed to save student info.");
              }
            };
          }

          // Parent info of a student
          try {
            const parents = await fetchJSON(`/api/user-students/parents/${user.id}`);
            if (Array.isArray(parents) && parents.length > 0) {
              const parent = parents[0];
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

      // Parent view (assigned students)
      if (user.role === "parent" && Array.isArray(user.assigned_students)) {
        studentInfoSection.innerHTML = `<div class="section-title">Assigned Students</div>`;
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

      // Edit: toggle fields (includes Assistance and PassportId)
      if (editBtn) {
        editBtn.onclick = () => {
          isEditMode = true;
          ["FirstName", "MiddleName", "LastName", "Email", "Assistance", "PassportId"].forEach(field => {
            const viewEl = document.getElementById(`view${field}`);
            const editEl = document.getElementById(`edit${field}`);
            if (viewEl && editEl) {
              viewEl.style.display = "none";
              editEl.style.display = "block";
            }
          });
          // vendor fields (if present in DOM)
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
          if (saveBtn) saveBtn.style.display = "inline-block";
          document.querySelectorAll(".remove-student-wrapper").forEach(el => (el.style.display = "block"));
        };
      }

      // Save changes (user + passport + vendor)
      if (saveBtn) {
        saveBtn.onclick = async () => {
          let hadError = false;

          // save main user fields
          try {
            await fetchJSON(`/api/users/${currentUserId}`, {
              method: "PATCH",
              body: JSON.stringify({
                first_name: document.getElementById("editFirstName")?.value,
                middle_name: document.getElementById("editMiddleName")?.value,
                last_name: document.getElementById("editLastName")?.value,
                email: document.getElementById("editEmail")?.value,
                on_assistance: (() => {
                  const el = document.getElementById("editAssistance");
                  return el ? el.value === "true" : false;
                })(),
              })
            });
          } catch (err) {
            hadError = true;
            console.warn("User update failed:", err);
          }

          // save passport id (from edit field if you add one on the page)
          try {
            const newPid = (document.getElementById("editPassportId")?.value || "").trim();
            const oldPid = currentUserData?._passport_id || "";

            if (newPid !== oldPid) {
              if (newPid === "") {
                await fetchJSON(`/api/passport/admin/${currentUserId}`, { method: "DELETE" });
              } else {
                const ok = /^[A-Za-z0-9\- ]{4,64}$/.test(newPid);
                if (!ok) throw new Error("Passport ID must be 4–64 chars (letters, numbers, spaces, dashes).");
                await fetchJSON(`/api/passport/admin/${currentUserId}`, {
                  method: "PUT",
                  body: JSON.stringify({ passport_id: newPid })
                });
              }
            }
          } catch (err) {
            hadError = true;
            console.warn("Passport save failed:", err);
          }

          // vendor patch
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

          if (hadError) {
            alert("Some changes were saved, but not all.");
          } else {
            alert("All changes saved.");
            isEditMode = false;
            saveBtn.style.display = "none";

            [
              "FirstName", "MiddleName", "LastName", "Email", "Assistance",
              "PassportId", "School", "Grade", "Expiry",
              "Business", "Category", "Phone", "VendorApproved"
            ].forEach(field => {
              const viewEl = document.getElementById(`view${field}`) || document.getElementById(`vendor${field}`);
              const editEl = document.getElementById(`edit${field}`) || document.getElementById(`editVendor${field}`);
              if (viewEl && editEl) {
                viewEl.style.display = "inline-block";
                editEl.style.display = "none";
              }
            });

            document.querySelectorAll(".remove-student-wrapper").forEach(el => (el.style.display = "none"));

            loadUserProfile();
          }
        };
      }

    } catch (err) {
      console.error("Failed to load user:", err);
      alert("Error loading user: " + err.message);
    }
  }

  // Logout
  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  // Force sign-out check
  (async () => {
    const token = localStorage.getItem("boop_jwt");
    if (!token) return;

    try {
      const res = await fetch("/api/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const me = await res.json();

      if (me.force_signed_out) {
        alert("You have been signed out by an administrator.");
        localStorage.clear();

        try {
          const sessionRes = await fetch(`/api/sessions/${me.email}`, { method: "DELETE" });
          if (sessionRes.status !== 200 && sessionRes.status !== 404) {
            console.warn("Session deletion failed:", await sessionRes.text());
          }
        } catch (err) {
          console.warn("Session cleanup failed:", err);
        }

        window.location.href = "../government-portal.html";
      }
    } catch (err) {
      console.error("Force sign-out check failed:", err);
    }
  })();

  // Paging
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

  // Note modal
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
  // expose for listeners above
  window.showNote = showNote;

  // Kick off
  loadUserProfile();
});
