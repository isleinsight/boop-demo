document.addEventListener("DOMContentLoaded", () => {
  const userTableBody = document.getElementById("userTableBody");
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const userCount = document.getElementById("userCount");
  const roleFilter = document.getElementById("roleFilter");
  const statusFilter = document.getElementById("statusFilter");
  const selectAllCheckbox = document.getElementById("selectAllCheckbox");
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  const paginationInfo = document.getElementById("paginationInfo");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  let allUsers = [];
  let filteredUsers = [];
  let currentPage = 1;
  const usersPerPage = 10;

  async function fetchUsers() {
    try {
      const res = await fetch("/users");
      const data = await res.json();
      allUsers = data.users || [];
      filteredUsers = [...allUsers];
      renderTablePage();
    } catch (err) {
      console.error("❌ Failed to fetch users:", err);
      userTableBody.innerHTML = `<tr><td colspan="7">Failed to load users.</td></tr>`;
    }
  }

  function renderTablePage() {
    userTableBody.innerHTML = "";
    const start = (currentPage - 1) * usersPerPage;
    const end = start + usersPerPage;
    const users = filteredUsers.slice(start, end);

    if (users.length === 0) {
      userTableBody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
      return;
    }

    users.forEach(user => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="checkbox" class="user-checkbox" data-id="${user.id}" /></td>
        <td>${user.first_name || "-"}</td>
        <td>${user.last_name || "-"}</td>
        <td>${user.email || "-"}</td>
        <td>${user.role || "-"}</td>
        <td><span style="color: ${user.status === 'suspended' ? '#e74c3c' : '#27ae60'};">${user.status || "-"}</span></td>
        <td><button class="btnView" data-id="${user.id}">View</button></td>
      `;
      userTableBody.appendChild(row);
    });

    userCount.textContent = `Total Users: ${filteredUsers.length}`;
    paginationInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = end >= filteredUsers.length;
  }

  function applyFilters() {
    const term = searchInput.value.trim().toLowerCase();
    const role = roleFilter.value;
    const status = statusFilter.value;

    filteredUsers = allUsers.filter(user => {
      const matchesSearch =
        user.first_name?.toLowerCase().includes(term) ||
        user.last_name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term);
      const matchesRole = role === "" || user.role === role;
      const matchesStatus = status === "" || user.status === status;
      return matchesSearch && matchesRole && matchesStatus;
    });

    currentPage = 1;
    renderTablePage();
  }

  searchBtn?.addEventListener("click", applyFilters);
  clearSearchBtn?.addEventListener("click", () => {
    searchInput.value = "";
    roleFilter.value = "";
    statusFilter.value = "";
    applyFilters();
  });
  roleFilter?.addEventListener("change", applyFilters);
  statusFilter?.addEventListener("change", applyFilters);

  selectAllCheckbox?.addEventListener("change", () => {
    document.querySelectorAll(".user-checkbox").forEach(cb => {
      cb.checked = selectAllCheckbox.checked;
    });
  });

  prevBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderTablePage();
    }
  });

  nextBtn?.addEventListener("click", () => {
    if (currentPage < Math.ceil(filteredUsers.length / usersPerPage)) {
      currentPage++;
      renderTablePage();
    }
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("boopUser");
    window.location.href = "index.html";
  });

  fetchUsers();
});
