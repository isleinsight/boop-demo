<script type="module">
// user-profile.js – PostgreSQL version ✅

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

  let currentUserId = new URLSearchParams(window.location.search).get("uid");
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
        parentNameEl.innerHTML = `<a href="user-profile.html?uid=${user.parent_id}">${parent.first_name} ${parent.last_name}</a>`;
        parentEmailEl.textContent = parent.email;
      }
    } catch (e) {
      alert("Failed to load user.");
      console.error(e);
      window.location.href = "view-users.html";
    }
  }

  async function performAction(action) {
    const endpoint = `/api/users/${currentUserId}`;
    if (action === "delete") {
      await fetch(endpoint, { method: "DELETE" });
      alert("User deleted.");
      window.location.href = "view-users.html";
    } else if (action === "suspend" || action === "unsuspend") {
      const status = action === "suspend" ? "suspended" : "active";
      await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      alert(`User ${status}.`);
      await loadUserProfile();
    } else if (action === "signout") {
      await fetch(`/api/users/${currentUserId}/signout`, { method: "POST" });
      alert("Sign-out request sent.");
    }
  }

  async function loadAssignedStudents(parentId) {
    const students = await fetchJSON(`/api/users?parentId=${parentId}`);
    assignedStudentsList.innerHTML = students.length === 0
      ? "<div>No assigned students found.</div>"
      : "";

    students.forEach(s => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div><span class="label">Name</span>
        <span class="value"><a href="user-profile.html?uid=${s.id}">${s.first_name} ${s.last_name}</a></span></div>
        <button class="student-remove-btn" data-id="${s.id}">Remove</button>
      `;
      assignedStudentsList.appendChild(div);
    });

    document.querySelectorAll(".student-remove-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const sid = btn.dataset.id;
        await fetch(`/api/users/${sid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent_id: null })
        });
        loadAssignedStudents(parentId);
      });
    });
  }

  async function searchStudents() {
    const search = studentSearchInput.value.trim();
    const url = `/api/users?role=student&search=${encodeURIComponent(search)}&page=${currentPage}`;
    const students = await fetchJSON(url);
    studentSearchResults.innerHTML = "";

    if (!students.length) {
      studentSearchResults.innerHTML = "<tr><td colspan='4'>No students found.</td></tr>";
      return;
    }

    students.forEach(s => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${s.first_name}</td>
        <td>${s.last_name}</td>
        <td>${s.email}</td>
        <td><input type="checkbox" value="${s.id}" /></td>
      `;
      studentSearchResults.appendChild(row);
    });
  }

  assignSelectedBtn.addEventListener("click", async () => {
    const selected = studentSearchResults.querySelectorAll("input:checked");
    if (!selected.length) return alert("No students selected.");
    for (const cb of selected) {
      await fetch(`/api/users/${cb.value}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: currentUserId })
      });
    }
    alert("Students assigned.");
    loadAssignedStudents(currentUserId);
    searchStudents();
  });

  addStudentBtn.addEventListener("click", () => {
    assignStudentForm.style.display = "block";
    assignStudentForm.scrollIntoView({ behavior: "smooth" });
    searchStudents();
  });

  studentSearchBtn.addEventListener("click", () => {
    currentPage = 1;
    searchStudents();
  });

  editBtn.addEventListener("click", () => {
    document.getElementById("viewFirstName").style.display = "none";
    document.getElementById("viewLastName").style.display = "none";
    document.getElementById("viewEmail").style.display = "none";
    document.getElementById("viewRole").style.display = "none";

    editFirstName.style.display = "block";
    editLastName.style.display = "block";
    editEmail.style.display = "block";
    editRole.style.display = "block";
    saveBtn.style.display = "inline-block";
  });

  saveBtn.addEventListener("click", async () => {
    await fetch(`/api/users/${currentUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: editFirstName.value,
        last_name: editLastName.value,
        email: editEmail.value,
        role: editRole.value
      })
    });
    alert("Profile updated.");
    location.reload();
  });

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  loadUserProfile();
});
</script>
