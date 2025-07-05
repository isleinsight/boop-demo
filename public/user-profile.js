document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const addStudentBtn = document.getElementById("addStudentBtn");
  const parentSection = document.getElementById("parentSection");
  const studentSection = document.getElementById("studentSection");
  const parentNameEl = document.getElementById("parentName");
  const parentEmailEl = document.getElementById("parentEmail");
  const assignedStudentsList = document.getElementById("assignedStudentsList");
  const assignStudentForm = document.getElementById("assignStudentForm");
  const studentSearchInput = document.getElementById("studentSearchInput");
  const studentSearchBtn = document.getElementById("studentSearchBtn");
  const studentSearchResults = document.getElementById("studentSearchResults");
  const assignSelectedBtn = document.getElementById("assignSelectedStudentsBtn");
  const nextPageBtn = document.getElementById("nextStudentPageBtn");
  const prevPageBtn = document.getElementById("prevStudentPageBtn");

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  if (!currentUserId) {
    alert("User ID not found.");
    window.location.href = "view-users.html";
  }
  localStorage.removeItem("selectedUserId");

  let currentUserData = null;
  let editFirstName, editLastName, editEmail, editRole;
  let currentPage = 1;

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Network error");
    return await res.json();
  }

  async function loadUserProfile() {
    try {
      const user = await fetchJSON(`/api/users/${currentUserId}`);
      currentUserData = user;

      let walletInfo = "";
      try {
        const walletRes = await fetchJSON(`/api/wallets/user/${user.id}`);
        if (walletRes && walletRes.id) {
          walletInfo += `<div><span class="label">Wallet ID</span><span class="value">${walletRes.id}</span></div>`;

          const cardsRes = await fetchJSON(`/api/cards?wallet_id=${walletRes.id}`);
          if (cardsRes.length > 0) {
            walletInfo += `<div><span class="label">Card Number</span><span class="value">${cardsRes[0].uid}</span></div>`;
          }
        }
      } catch (err) {
        console.warn("No wallet or card found:", err.message);
      }

      userInfo.innerHTML = `
        <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.first_name}</span>
        <input type="text" id="editFirstName" value="${user.first_name}" style="display:none; width: 100%;" /></div>

        <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.last_name}</span>
        <input type="text" id="editLastName" value="${user.last_name}" style="display:none; width: 100%;" /></div>

        <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email}</span>
        <input type="email" id="editEmail" value="${user.email}" style="display:none; width: 100%;" /></div>

        <div><span class="label">Status</span><span class="value" id="viewStatus" style="color:${user.status === 'suspended' ? 'red' : 'green'}">${user.status}</span></div>

        <div><span class="label">Role</span><span class="value" id="viewRole">${user.role}</span>
        <select id="editRole" style="display:none; width: 100%;">
          <option value="cardholder">Cardholder</option>
          <option value="parent">Parent</option>
          <option value="vendor">Vendor</option>
          <option value="senior">Senior</option>
          <option value="admin">Admin</option>
          <option value="student">Student</option>
        </select></div>

        ${walletInfo}
      `;

      const dropdown = document.createElement("select");
      dropdown.innerHTML = `
        <option value="">Actions</option>
        <option value="${user.status === "suspended" ? "unsuspend" : "suspend"}">${user.status === "suspended" ? "Unsuspend" : "Suspend"}</option>
        <option value="signout">Force Sign-out</option>
        <option value="delete">Delete</option>
      `;
      dropdown.addEventListener("change", async () => {
        const action = dropdown.value;
        dropdown.value = "";
        if (action === "delete") {
          const confirmDelete = prompt("Type DELETE to confirm.");
          if (confirmDelete !== "DELETE") return;
        }
        await performAction(action);
      });
      userInfo.appendChild(dropdown);

      editFirstName = document.getElementById("editFirstName");
      editLastName = document.getElementById("editLastName");
      editEmail = document.getElementById("editEmail");
      editRole = document.getElementById("editRole");
      editRole.value = user.role;

      if (user.role === "parent") {
        addStudentBtn.style.display = "inline-block";
        studentSection.style.display = "block";
        loadAssignedStudents(user.id);
      }

      if (user.role === "student" && user.parent_id) {
        parentSection.style.display = "block";
        const parent = await fetchJSON(`/api/users/${user.parent_id}`);
        parentNameEl.innerHTML = `<a href="user-profile.html">${parent.first_name} ${parent.last_name}</a>`;
        parentEmailEl.textContent = parent.email;
      }
    } catch (e) {
      alert("Failed to load user.");
      console.error(e);
      window.location.href = "view-users.html";
    }
  }

  // ... existing event listeners and utility functions remain unchanged

  loadUserProfile();
});
