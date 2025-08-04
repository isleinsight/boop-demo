document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("boop_jwt");
  const userTableBody = document.getElementById("userTableBody");
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const roleFilter = document.getElementById("roleFilter");
  const statusFilter = document.getElementById("statusFilter");
  const selectAll = document.getElementById("selectAllCheckbox");
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const paginationInfo = document.getElementById("paginationInfo");
  const userCount = document.getElementById("userCount");

  let currentPage = 1;
  const perPage = 10;
  let totalPages = 1;
  let allUsers = [];
  let currentUserEmail = null;
  let currentUser = null;
  let sortBy = 'first_name'; // Default sort by first_name
  let sortDirection = 'asc'; // Default ascending

  // Restrict access to only superadmin, admin, and support-type admins
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const meData = await res.json();

    const allowedTypes = ["super_admin", "admin", "support"];
    const isAllowed = meData?.role === "admin" && allowedTypes.includes(meData?.type);

    if (!isAllowed) {
      throw new Error("Not authorized");
    }

    currentUser = meData;
    currentUserEmail = meData.email;
  } catch (err) {
    console.warn("🔒 Not authorized or error fetching user:", err);
    localStorage.removeItem("boop_jwt");
    localStorage.removeItem("boopUser");
    window.location.href = "login.html";
    return;
  }

  async function fetchUsers() {
    try {
      let role = roleFilter.value;
      let assistanceOnly = false;

      if (role === "cardholder_assistance") {
        role = "cardholder";
        assistanceOnly = true;
      }

      const query = `?page=${currentPage}&perPage=${perPage}&search=${encodeURIComponent(searchInput.value)}&role=${encodeURIComponent(role)}&status=${encodeURIComponent(statusFilter.value)}${assistanceOnly ? '&assistanceOnly=true' : ''}&sortBy=${encodeURIComponent(sortBy)}&sortDirection=${encodeURIComponent(sortDirection)}`;
      const res = await fetch(`/api/users${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to fetch users: ${res.status}`);
      }
      const data = await res.json();
      allUsers = data.users || [];
      totalPages = data.totalPages || 1;
      render();
      userCount.textContent = `Total Users: ${data.total}`;
      paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    } catch (err) {
      console.error("⚠️ Error loading users:", err);
      userTableBody.innerHTML = `<tr><td colspan="7">Error loading users: ${err.message}</td></tr>`;
    }
  }

  async function performAction(user, action) {
    try {
      if (action === "delete") {
        if (user.email === currentUserEmail) return alert("You cannot delete your own account.");
        const confirmText = prompt("Type DELETE to confirm.");
        if (confirmText !== "DELETE") return;

        const res = await fetch(`/api/users/${user.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ uid: currentUser?.id })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || `Delete failed with status ${res.status}`);
        }

        alert("✅ User deleted successfully.");
      } else if (action === "suspend" || action === "unsuspend") {
        const newStatus = action === "suspend" ? "suspended" : "active";
        const res = await fetch(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
          const err = await res.json();
          return alert("❌ Failed to update status: " + (err.message || res.status));
        }

        if (newStatus === "suspended") {
          await fetch(`/api/users/${user.id}/signout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      } else if (action === "signout") {
        const res = await fetch(`/api/users/${user.id}/signout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const err = await res.json();
          return alert("❌ Force sign-out failed: " + (err.message || res.status));
        }
        alert("✅ User signed out.");
      } else if (action === "restore") {
        await fetch(`/api/users/${user.id}/restore`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      await fetchUsers();
    } catch (err) {
      console.error("❌ performAction failed:", err);
      alert("Action failed: " + err.message);
    }
  }

  function createDropdown(user) {
    const select = document.createElement("select");
    select.classList.add("btnEdit");
    select.innerHTML = `
      <option value="action">Action</option>
      <option value="view">View Profile</option>
      ${user.deleted_at ? '<option value="restore">Restore</option>' : `
        ${user.status === "suspended" ? '<option value="unsuspend">Unsuspend</option>' : '<option value="suspend">Suspend</option>'}
        <option value="signout">Force Sign-out</option>
        <option value="delete">Delete</option>`}
    `;
    select.addEventListener("change", async () => {
      const action = select.value;
      select.value = "action";
      if (action === "view") {
        localStorage.setItem("selectedUserId", user.id);
        return (window.location.href = "user-profile.html");
      }
      await performAction(user, action);
    });
    return select;
  }

  function render() {
    userTableBody.innerHTML = "";
    if (!allUsers.length) {
      userTableBody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
      return;
    }

    allUsers.forEach(user => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="checkbox" class="user-checkbox" data-id="${user.id}" data-email="${user.email}" /></td>
        <td>${user.first_name || ""}</td>
        <td>${user.last_name || ""}</td>
        <td>${user.email || ""}</td>
        <td>${user.role || ""}</td>
        <td><span style="color:${user.status === "suspended" ? "#e74c3c" : "#27ae60"}">${user.status}</span></td>
      `;
      const td = document.createElement("td");
      td.appendChild(createDropdown(user));
      row.appendChild(td);
      userTableBody.appendChild(row);
    });

    // Update sort indicators
    document.querySelectorAll('.sort-header').forEach(header => {
      header.innerHTML = header.dataset.sortLabel;
      if (header.dataset.sort === sortBy) {
        header.innerHTML += sortDirection === 'asc' ? ' ▲' : ' ▼';
      }
    });

    attachCheckboxListeners();
    updateDeleteButtonVisibility();

    prevBtn.style.display = currentPage > 1 ? "inline-block" : "none";
    nextBtn.style.display = currentPage < totalPages ? "inline-block" : "none";
  }

  function attachCheckboxListeners() {
    document.querySelectorAll(".user-checkbox").forEach(cb => {
      cb.addEventListener("change", updateDeleteButtonVisibility);
    });
  }

  function updateDeleteButtonVisibility() {
    const checked = document.querySelectorAll(".user-checkbox:checked").length;
    deleteSelectedBtn.style.display = checked > 0 ? "block" : "none";
  }

  // Add sort event listeners
  document.querySelectorAll('.sort-header').forEach(header => {
    header.addEventListener('click', () => {
      const column = header.dataset.sort;
      if (sortBy === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortBy = column;
        sortDirection = 'asc';
      }
      currentPage = 1;
      fetchUsers();
    });
  });

  searchBtn.addEventListener("click", () => { currentPage = 1; fetchUsers(); });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      currentPage = 1;
      fetchUsers();
    }
  });
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    roleFilter.value = "";
    statusFilter.value = "";
    sortBy = 'first_name';
    sortDirection = 'asc';
    currentPage = 1;
    fetchUsers();
  });

  roleFilter.addEventListener("change", () => { currentPage = 1; fetchUsers(); });
  statusFilter.addEventListener("change", () => { currentPage = 1; fetchUsers(); });
  prevBtn.addEventListener("click", () => { if (currentPage > 1) currentPage--; fetchUsers(); });
  nextBtn.addEventListener("click", () => { if (currentPage < totalPages) currentPage++; fetchUsers(); });

  selectAll.addEventListener("change", () => {
    document.querySelectorAll(".user-checkbox").forEach(cb => cb.checked = selectAll.checked);
    updateDeleteButtonVisibility();
  });

  deleteSelectedBtn.addEventListener("click", async () => {
    const selected = [...document.querySelectorAll(".user-checkbox:checked")];
    const ids = selected.map(cb => cb.dataset.id);
    const emails = selected.map(cb => cb.dataset.email);
    if (emails.includes(currentUserEmail)) return alert("You cannot delete your own account.");
    const confirmText = prompt("Type DELETE to confirm deletion.");
    if (confirmText !== "DELETE") return;

    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/users/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ uid: currentUser?.id })
        }).then(res => {
          if (!res.ok) {
            return res.json().then(err => {
              throw new Error(err.message || `Delete failed for user ${id} with status ${res.status}`);
            });
          }
          return res;
        })
      ));
      alert("✅ Selected users deleted successfully.");
      fetchUsers();
    } catch (err) {
      console.error("⚠️ Bulk delete failed:", err);
      alert("Delete failed: " + err.message);
    }
  });

  fetchUsers();
});

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", () => {
  fetch("/api/logout", { method: "POST" })
    .then(() => {
      localStorage.removeItem("boop_jwt");
      localStorage.removeItem("boopUser");
      window.location.href = "login.html";
    })
    .catch(() => alert("Logout failed."));
});
