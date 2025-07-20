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

  let allUsers = [];
  let currentUserEmail = null;
  let currentUser = null; 
  let currentPage = 1;
  const perPage = 10;
  let totalPages = 1;
  let totalUsersCount = 0;

  try {
    const res = await fetch("/api/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const meData = await res.json();
    currentUser = meData;
    currentUserEmail = meData.email;
  } catch (err) {
    console.error("Could not fetch current user email");
  }

  async function fetchUsers() {
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
      totalUsersCount = data.total || 0;
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
    `}`;
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

        const res = await fetch(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
          const err = await res.json();
          alert("❌ Failed to update status: " + (err.message || res.status));
          return;
        }

        console.log(`✅ User ${user.email} status updated to ${newStatus}`);
      } else if (action === "signout") {
        const res = await fetch(`/api/users/${user.id}/signout`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) {
          const err = await res.json();
          alert("❌ Force sign-out failed: " + (err.message || res.status));
          return;
        }

        console.log(`✅ Forced sign-out for ${user.email}`);
      } else if (action === "restore") {
        await fetch(`/api/users/${user.id}/restore`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
      }

      await fetchUsers();
    } catch (err) {
      console.error("❌ Action failed:", err);
      alert("Action failed. Check console.");
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
        fetch(`/api/users/${id}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ uid: currentUser?.id })
        })
      ));
      fetchUsers();
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
