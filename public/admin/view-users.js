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
  let currentUserEmail = null;
  let currentPage = 1;
  const perPage = 10;
  let totalPages = 1;
  let totalUsersCount = 0; // ✅ Needed for total across all pages

  let sortKey = null;
  let sortOrder = 'asc';

  try {
    const token = localStorage.getItem("boop_jwt");
const res = await fetch("/api/me", {
  headers: {
    "Authorization": `Bearer ${token}`
  }
});
    const meData = await res.json();
    currentUserEmail = meData.email;
  } catch (err) {
    console.error("Could not fetch current user email");
  }

  async function fetchUsers() {
    const token = localStorage.getItem("boop_jwt");
    try {
      const search = encodeURIComponent(searchInput.value);
      const role = encodeURIComponent(roleFilter.value);
      const status = encodeURIComponent(statusFilter.value);
      const query = `?page=${currentPage}&perPage=${perPage}&search=${search}&role=${role}&status=${status}`;

      const res = await fetch(`/api/users${query}`, {
  headers: {
    "Authorization": `Bearer ${token}`
  }
});
      const data = await res.json();
      allUsers = data.users || [];
      totalPages = data.totalPages || 1;
      totalUsersCount = data.total || 0; // ✅ store total count from API
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
      ${user.deleted_at
  ? '<option value="restore">Restore</option>'
  : `
      ${user.status === "suspended"
        ? '<option value="unsuspend">Unsuspend</option>'
        : '<option value="suspend">Suspend</option>'}
      <option value="signout">Force Sign-out</option>
      <option value="delete">Delete</option>
    `
}
    `;
    select.addEventListener("change", async () => {
      const action = select.value;
      select.value = "action";
      if (action === "view") {
        localStorage.setItem("selectedUserId", user.id);
        window.location.href = "user-profile.html";
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
  const token = localStorage.getItem("boop_jwt"); // ✅ Add this line
  try {
    if (action === "delete") {
      await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
    } else if (action === "suspend" || action === "unsuspend") {
      const newStatus = action === "suspend" ? "suspended" : "active";
      await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // ✅ Required here too
        },
        body: JSON.stringify({ status: newStatus }),
      });
    } else if (action === "signout") {
      await fetch(`/api/users/${user.id}/signout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
    } else if (action === "restore") {
      await fetch(`/api/users/${user.id}/restore`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
    }

    fetchUsers(); // Refresh table
  } catch (err) {
    console.error("❌ Action failed:", err);
    alert("Action failed.");
  }
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

    // ✅ TOTAL users for entire result set, not just this page
    userCount.textContent = `Total Users: ${totalUsersCount}`;
    paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.style.display = currentPage > 1 ? "inline-block" : "none";
    nextBtn.style.display = currentPage < totalPages ? "inline-block" : "none";

    attachCheckboxListeners();
    updateDeleteButtonVisibility();
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
      fetchUsers(); // Refresh after delete
    } catch (e) {
      console.error("Bulk delete failed:", e);
      alert("Bulk delete failed.");
    }
  });

  fetchUsers();
});

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
