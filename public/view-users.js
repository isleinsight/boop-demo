// view-users.js ✅
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
      ? slice.map(u => `
        <tr>
          <td><input type="checkbox" class="user-checkbox" data-id="${u.id}" data-email="${u.email}"/></td>
          <td>${u.first_name || ""}</td>
          <td>${u.last_name || ""}</td>
          <td>${u.email || ""}</td>
          <td>${u.role || ""}</td>
          <td><span style="color:${u.status === "suspended" ? "#e74c3c" : "#27ae60"}">${u.status || ""}</span></td>
          <td><button onclick="deleteUser('${u.id}')">Delete</button></td>
        </tr>
      `).join('')
      : `<tr><td colspan="7">No users found.</td></tr>`;

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
    if (currentPage > 1) { currentPage--; render(); }
  });
  nextBtn.addEventListener("click", () => {
    if (currentPage * perPage < filteredUsers.length) { currentPage++; render(); }
  });

  window.deleteUser = async (id) => {
    const confirmDelete = prompt("Type DELETE to confirm");
    if (confirmDelete !== "DELETE") return;

    try {
      await fetch(`/api/users/${id}`, { method: "DELETE" });
      allUsers = allUsers.filter(u => u.id !== id);
      applyFilters();
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Delete failed.");
    }
  };

  selectAll.addEventListener("change", () => {
    document.querySelectorAll(".user-checkbox").forEach(cb => {
      cb.checked = selectAll.checked;
    });
    updateDeleteButtonVisibility();
  });

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

  fetchUsers();
});
