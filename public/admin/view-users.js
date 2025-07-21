//view-users.js

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

  let allUsers = [], currentUser = null, currentUserEmail = null;
  let currentPage = 1, totalPages = 1, totalUsersCount = 0;
  const perPage = 10;

  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const me = await res.json();
    currentUser = me;
    currentUserEmail = me.email;
  } catch {
    console.error("⚠️ Failed to fetch current user.");
  }

  async function fetchUsers() {
    try {
      const query = `?page=${currentPage}&perPage=${perPage}&search=${encodeURIComponent(searchInput.value)}&role=${encodeURIComponent(roleFilter.value)}&status=${encodeURIComponent(statusFilter.value)}`;
      const res = await fetch(`/api/users${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      allUsers = data.users || [];
      totalPages = data.totalPages || 1;
      totalUsersCount = data.total || 0;
      renderUsers();
    } catch (err) {
      console.error("❌ Error loading users:", err);
    }
  }

  function renderUsers() {
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
        <td><span style="color:${user.status === "suspended" ? "#e74c3c" : "#27ae60"}">${user.status || ""}</span></td>
      `;
      const actionsTd = document.createElement("td");
      actionsTd.appendChild(createActionDropdown(user));
      row.appendChild(actionsTd);
      userTableBody.appendChild(row);
    });

    userCount.textContent = `Total Users: ${totalUsersCount}`;
    paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.style.display = currentPage > 1 ? "inline-block" : "none";
    nextBtn.style.display = currentPage < totalPages ? "inline-block" : "none";
    updateDeleteButtonVisibility();
    attachCheckboxListeners();
  }

  function createActionDropdown(user) {
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
        window.location.href = "user-profile.html";
        return;
      }
      if (action === "delete" && user.email === currentUserEmail) {
        alert("❌ You cannot delete your own account.");
        return;
      }
      if (action === "delete") {
        const confirm = prompt("Type DELETE to confirm.");
        if (confirm !== "DELETE") return;
      }
      await performAction(user, action);
    });
    return select;
  }

  async function performAction(user, action) {
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      };

      if (action === "suspend" || action === "unsuspend") {
        const newStatus = action === "suspend" ? "suspended" : "active";
        const res = await fetch(`/api/users/${user.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw await res.json();
      } else if (action === "signout") {
        const res = await fetch(`/api/users/${user.id}/signout`, { method: "POST", headers });
        if (!res.ok) throw await res.json();
      } else if (action === "restore") {
        await fetch(`/api/users/${user.id}/restore`, { method: "PATCH", headers });
      } else if (action === "delete") {
        await fetch(`/api/users/${user.id}`, { method: "DELETE", headers });
      }

      fetchUsers();
    } catch (err) {
      console.error("❌ Action failed:", err);
      alert("❌ " + (err.message || "Action failed"));
    }
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

  selectAll.addEventListener("change", () => {
    const all = selectAll.checked;
    document.querySelectorAll(".user-checkbox").forEach(cb => (cb.checked = all));
    updateDeleteButtonVisibility();
  });

  deleteSelectedBtn.addEventListener("click", async () => {
    const selected = [...document.querySelectorAll(".user-checkbox:checked")];
    const ids = selected.map(cb => cb.dataset.id);
    const emails = selected.map(cb => cb.dataset.email);

    if (emails.includes(currentUserEmail)) {
      alert("You cannot delete your own account.");
      return;
    }

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
        })
      ));
      fetchUsers();
    } catch (err) {
      console.error("❌ Bulk delete failed:", err);
      alert("❌ Bulk delete failed.");
    }
  });

  searchBtn.addEventListener("click", () => {
    currentPage = 1;
    fetchUsers();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    roleFilter.value = "";
    statusFilter.value = "";
    currentPage = 1;
    fetchUsers();
  });

  roleFilter.addEventListener("change", () => {
    currentPage = 1;
    fetchUsers();
  });

  statusFilter.addEventListener("change", () => {
    currentPage = 1;
    fetchUsers();
  });

  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      fetchUsers();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      fetchUsers();
    }
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" })
      .then(() => window.location.href = "login.html")
      .catch(() => alert("Logout failed."));
  });

  fetchUsers();
});
