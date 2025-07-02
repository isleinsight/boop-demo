document.addEventListener("DOMContentLoaded", () => {
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
  let currentPage = 1;
  const perPage = 10;

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

  function render() {
    const start = (currentPage - 1) * perPage;
    const slice = filteredUsers.slice(start, start + perPage);

    userTableBody.innerHTML = slice.length
      ? slice.map(u => {
          const statusColor = u.status === "suspended" ? "#e74c3c" : "#27ae60";
          const statusText = u.status || "";
          const toggleStatus = u.status === "suspended" ? "unsuspend" : "suspend";

          return `
            <tr>
              <td><input type="checkbox" class="user-checkbox" data-id="${u.id}" data-email="${u.email}" /></td>
              <td>${u.first_name || ""}</td>
              <td>${u.last_name || ""}</td>
              <td>${u.email || ""}</td>
              <td>${u.role || ""}</td>
              <td><span style="color:${statusColor}">${statusText}</span></td>
              <td>
                <select class="action-dropdown" data-id="${u.id}" data-email="${u.email}" data-status="${u.status}">
                  <option value="">Action</option>
                  <option value="view">View Profile</option>
                  <option value="${toggleStatus}">${toggleStatus.charAt(0).toUpperCase() + toggleStatus.slice(1)}</option>
                  <option value="delete">Delete</option>
                </select>
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="7">No users found.</td></tr>`;

    userCount.textContent = `Total Users: ${filteredUsers.length}`;
    paginationInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage * perPage >= filteredUsers.length;

    attachCheckboxListeners();
    attachDropdownListeners();
    updateDeleteButtonVisibility();
  }

  function attachCheckboxListeners() {
    document.querySelectorAll(".user-checkbox").forEach(cb => {
      cb.addEventListener("change", updateDeleteButtonVisibility);
    });
  }

  function attachDropdownListeners() {
    document.querySelectorAll(".action-dropdown").forEach(dropdown => {
      dropdown.addEventListener("change", async () => {
        const action = dropdown.value;
        const id = dropdown.dataset.id;
        const email = dropdown.dataset.email;
        const currentStatus = dropdown.dataset.status;

        dropdown.value = "";

        if (action === "view") {
          window.location.href = `user-profile.html?uid=${id}`;
          return;
        }

        if (action === "delete") {
          const confirmDelete = prompt(`Type DELETE to delete ${email}`);
          if (confirmDelete !== "DELETE") return;
          await performAction(id, "delete");
          return;
        }

        if (action === "suspend" || action === "unsuspend") {
          const newStatus = action === "suspend" ? "suspended" : "active";
          await performAction(id, "status", newStatus);
        }
      });
    });
  }

  async function performAction(id, type, value = null) {
    try {
      if (type === "delete") {
        await fetch(`/api/users/${id}`, { method: "DELETE" });
        allUsers = allUsers.filter(u => u.id !== id);
      } else if (type === "status") {
        await fetch(`/api/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: value })
        });
        const user = allUsers.find(u => u.id === id);
        if (user) user.status = value;
      }
      applyFilters();
    } catch (e) {
      console.error("❌ Action failed:", e);
      alert("Action failed.");
    }
  }

  function updateDeleteButtonVisibility() {
    const anyChecked = document.querySelectorAll(".user-checkbox:checked").length > 0;
    deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
  }

  deleteSelectedBtn.addEventListener("click", async () => {
    const checked = [...document.querySelectorAll(".user-checkbox:checked")].map(cb => cb.dataset.id);
    if (!checked.length) return;

    const confirmBulk = prompt("Type DELETE to confirm deletion of selected users.");
    if (confirmBulk !== "DELETE") return;

    try {
      await Promise.all(checked.map(id =>
        fetch(`/api/users/${id}`, { method: "DELETE" })
      ));
      allUsers = allUsers.filter(u => !checked.includes(u.id));
      applyFilters();
    } catch (e) {
      console.error("Bulk delete failed:", e);
      alert("Bulk delete failed.");
    }
  });

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

  fetchUsers();
});
