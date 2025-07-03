// view-users.js

document.addEventListener("DOMContentLoaded", async () => {
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

  let allUsers = [];
  let filteredUsers = [];
  let currentUserEmail = null;
  let currentPage = 1;
  const perPage = 10;

  // Fetch current user email (needed to prevent self-deletion)
  try {
    const meRes = await fetch("/api/me");
    const meData = await meRes.json();
    currentUserEmail = meData.email;
  } catch (err) {
    console.error("Could not fetch current user email");
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      allUsers = await res.json();
      filteredUsers = [...allUsers];
      render();
    } catch (e) {
      console.error("Error fetching users:", e);
    }
  }

  function createDropdown(user) {
    const select = document.createElement("select");
    select.classList.add("btnEdit");
    select.innerHTML = `
      <option value="action">Action</option>
      <option value="view">View Profile</option>
      ${user.status === "suspended"
        ? '<option value="unsuspend">Unsuspend</option>'
        : '<option value="suspend">Suspend</option>'}
      <option value="signout">Force Sign-out</option>
      <option value="delete">Delete</option>
    `;
    select.addEventListener("change", async () => {
      const action = select.value;
      select.value = "action";
      if (action === "view") {
        window.location.href = `user-profile.html?uid=${user.id}`;
        return;
      }
      if (action === "delete") {
        if (user.email === currentUserEmail) {
          alert("You cannot delete your own account.");
          return;
        }
        const input = prompt("Type DELETE to confirm.");
        if (input !== "DELETE") return;
      }
      await performAction(user, action);
    });
    return select;
  }

  async function performAction(user, action) {
    try {
      if (action === "delete") {
        await fetch(`/api/users/${user.id}`, { method: "DELETE" });
        allUsers = allUsers.filter(u => u.id !== user.id);
      } else if (action === "suspend" || action === "unsuspend") {
        const newStatus = action === "suspend" ? "suspended" : "active";
        await fetch(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        const updated = allUsers.find(u => u.id === user.id);
        if (updated) updated.status = newStatus;
      } else if (action === "signout") {
        await fetch(`/api/users/${user.id}/signout`, { method: "POST" });
      }
      applyFilters();
    } catch (err) {
      console.error("❌ Action failed:", err);
      alert("Action failed.");
    }
  }

  function render() {
    const start = (currentPage - 1) * perPage;
    const slice = filteredUsers.slice(start, start + perPage);

    userTableBody.innerHTML = "";

    if (!slice.length) {
      userTableBody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
      return;
    }

    slice.forEach(user => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td><input type="checkbox" class="user-checkbox" data-id="${user.id}" data-email="${user.email}" /></td>
        <td>${user.first_name || ""}</td>
        <td>${user.last_name || ""}</td>
        <td>${user.email || ""}</td>
        <td>${user.role || ""}</td>
        <td>
          <span style="color:${user.status === "suspended" ? "#e74c3c" : "#27ae60"}">
            ${user.status || ""}
          </span>
        </td>
      `;

      const actionsTd = document.createElement("td");
      actionsTd.appendChild(createDropdown(user));
      row.appendChild(actionsTd);

      userTableBody.appendChild(row);
    });

    userCount.textContent = `Total Users: ${filteredUsers.length}`;
    paginationInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage * perPage >= filteredUsers.length;

    attachCheckboxListeners();
    updateDeleteButtonVisibility();
  }

  function applyFilters() {
    const term = searchInput.value.toLowerCase();
    const role = roleFilter.value;
    const status = statusFilter.value;

    filteredUsers = allUsers.filter(u =>
      (u.first_name?.toLowerCase().includes(term)
        || u.last_name?.toLowerCase().includes(term)
        || u.email?.toLowerCase().includes(term))
      && (!role || u.role === role)
      && (!status || u.status === status)
    );

    currentPage = 1;
    render();
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

  searchBtn.addEventListener("click", applyFilters);
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    roleFilter.value = "";
    statusFilter.value = "";
    applyFilters();
  });
  roleFilter.addEventListener("change", applyFilters);
  statusFilter.addEventListener("change", applyFilters);

  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      render();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (currentPage * perPage < filteredUsers.length) {
      currentPage++;
      render();
    }
  });

  selectAll.addEventListener("change", () => {
    document.querySelectorAll(".user-checkbox").forEach(cb => {
      cb.checked = selectAll.checked;
    });
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

    const confirmText = prompt("Type DELETE to confirm deletion of selected users.");
    if (confirmText !== "DELETE") return;

    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/users/${id}`, { method: "DELETE" })
      ));
      allUsers = allUsers.filter(u => !ids.includes(u.id));
      applyFilters();
    } catch (e) {
      console.error("Bulk delete failed:", e);
      alert("Bulk delete failed.");
    }
  });

  fetchUsers();
});


// Handle logout button
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", () => {
  fetch("/api/logout", { method: "POST" })
    .then(() => {
      window.location.href = "login.html";
    })
    .catch(() => {
      alert("Logout failed.");
    });
});
