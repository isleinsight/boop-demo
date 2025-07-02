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

  const fetchUsers = async () => {
    try {
      const res = await fetch("/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch users");
      allUsers = data.users || [];
      filteredUsers = [...allUsers];
      renderTablePage();
    } catch (err) {
      console.error("Fetch error:", err);
      userTableBody.innerHTML = `<tr><td colspan="7">Error loading users.</td></tr>`;
    }
  };

  const applyFilters = () => {
    const term = searchInput.value.trim().toLowerCase();
    const role = roleFilter.value;
    const status = statusFilter.value;

    filteredUsers = allUsers.filter(user => {
      const matchesSearch =
        user.first_name?.toLowerCase().includes(term) ||
        user.last_name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term);
      const matchesRole = !role || user.role === role;
      const matchesStatus = !status || user.status === status;
      return matchesSearch && matchesRole && matchesStatus;
    });

    currentPage = 1;
    renderTablePage();
  };

  const renderTablePage = () => {
    userTableBody.innerHTML = "";
    const start = (currentPage - 1) * usersPerPage;
    const end = start + usersPerPage;
    const pageUsers = filteredUsers.slice(start, end);

    if (pageUsers.length === 0) {
      userTableBody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
      return;
    }

    pageUsers.forEach(user => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td><input type="checkbox" class="user-checkbox" data-id="${user.id}" /></td>
        <td>${user.first_name || "-"}</td>
        <td>${user.last_name || "-"}</td>
        <td>${user.email || "-"}</td>
        <td>${user.role || "-"}</td>
        <td><span style="color: ${user.status === 'suspended' ? '#e74c3c' : '#27ae60'}">${user.status || '-'}</span></td>
        <td><button class="delete-btn" data-id="${user.id}">Delete</button></td>
      `;

      userTableBody.appendChild(row);
    });

    userCount.textContent = `Total Users: ${filteredUsers.length}`;
    paginationInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = end >= filteredUsers.length;

    attachDeleteEvents();
    updateDeleteButton();
  };

  const attachDeleteEvents = () => {
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (confirm("Delete this user?")) {
          await deleteUser(id);
          await fetchUsers();
        }
      });
    });
  };

  const deleteUser = async (id) => {
    try {
      const res = await fetch(`/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed");
    } catch (err) {
      alert("Error deleting user.");
    }
  };

  const updateDeleteButton = () => {
    const anyChecked = document.querySelectorAll(".user-checkbox:checked").length > 0;
    deleteSelectedBtn.style.display = anyChecked ? "inline-block" : "none";
  };

  deleteSelectedBtn.addEventListener("click", async () => {
    const checked = document.querySelectorAll(".user-checkbox:checked");
    const ids = Array.from(checked).map(cb => cb.dataset.id);

    if (!ids.length || !confirm(`Delete ${ids.length} selected users?`)) return;

    for (const id of ids) {
      await deleteUser(id);
    }

    await fetchUsers();
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
      renderTablePage();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (currentPage < Math.ceil(filteredUsers.length / usersPerPage)) {
      currentPage++;
      renderTablePage();
    }
  });

  selectAllCheckbox.addEventListener("change", () => {
    const checkboxes = document.querySelectorAll(".user-checkbox");
    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateDeleteButton();
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("boopUser");
    window.location.href = "index.html";
  });

  fetchUsers();
});
