document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const addStudentBtn = document.getElementById("addStudentBtn");
  const studentSection = document.getElementById("studentSection");
  const assignedStudentsList = document.getElementById("assignedStudentsList");
  const assignForm = document.getElementById("assignStudentForm");
  const searchInput = document.getElementById("studentSearchInput");
  const searchBtn = document.getElementById("studentSearchBtn");
  const studentSearchResults = document.getElementById("studentSearchResults");
  const prevBtn = document.getElementById("prevStudentPageBtn");
  const nextBtn = document.getElementById("nextStudentPageBtn");
  const paginationInfo = document.getElementById("studentPaginationInfo");
  const assignSelectedBtn = document.getElementById("assignSelectedStudentsBtn");

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  let currentPage = 1;
  let allStudents = [];

  if (!currentUserId) {
    alert("User ID not found.");
    window.location.href = "view-users.html";
  }

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Network error");
    return await res.json();
  }

  async function loadUserProfile() {
    const user = await fetchJSON(`/api/users/${currentUserId}`);
    userInfo.innerHTML = `
      <div><span class="label">First Name</span><span class="value">${user.first_name}</span></div>
      <div><span class="label">Last Name</span><span class="value">${user.last_name}</span></div>
      <div><span class="label">Email</span><span class="value">${user.email}</span></div>
      <div><span class="label">Role</span><span class="value">${user.role}</span></div>
    `;

    if (user.role === "parent") {
      addStudentBtn.style.display = "inline-block";
      studentSection.style.display = "block";
      loadAssignedStudents(user.id);
    }
  }

  async function loadAssignedStudents(parentId) {
    const students = await fetchJSON(`/api/users?parentId=${parentId}`);
    assignedStudentsList.innerHTML = students.map(s => `
      <div>
        <span class="label">Name</span>
        <span class="value"><a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${s.id}')">${s.first_name} ${s.last_name}</a></span>
        <button onclick="removeStudent('${s.id}')">Remove</button>
      </div>
    `).join('');
  }

  window.removeStudent = async function (id) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: null })
    });
    loadAssignedStudents(currentUserId);
  };

  addStudentBtn?.addEventListener("click", () => {
    assignForm.style.display = assignForm.style.display === "none" ? "block" : "none";
  });

  searchBtn?.addEventListener("click", async () => {
    try {
      const query = searchInput.value.trim();
      const res = await fetchJSON(`/api/users?role=student&q=${encodeURIComponent(query)}`);
      allStudents = res;
      currentPage = 1;
      updatePagination();
    } catch (err) {
      console.error("Error searching students", err);
    }
  });

  function updatePagination() {
    const perPage = 5;
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const pageStudents = allStudents.slice(start, end);

    studentSearchResults.innerHTML = pageStudents.map(s => `
      <tr>
        <td>${s.first_name}</td>
        <td>${s.last_name}</td>
        <td>${s.email}</td>
        <td><input type="checkbox" data-id="${s.id}"></td>
      </tr>
    `).join('');

    paginationInfo.textContent = `Page ${currentPage} of ${Math.ceil(allStudents.length / perPage)}`;
    prevBtn.style.display = currentPage > 1 ? "inline-block" : "none";
    nextBtn.style.display = end < allStudents.length ? "inline-block" : "none";
  }

  prevBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      updatePagination();
    }
  });

  nextBtn?.addEventListener("click", () => {
    const maxPage = Math.ceil(allStudents.length / 5);
    if (currentPage < maxPage) {
      currentPage++;
      updatePagination();
    }
  });

  assignSelectedBtn?.addEventListener("click", async () => {
    const checkboxes = document.querySelectorAll("#studentSearchResults input[type='checkbox']:checked");
    const studentIds = Array.from(checkboxes).map(cb => cb.dataset.id);
    if (studentIds.length === 0) return alert("No students selected.");

    try {
      await Promise.all(studentIds.map(id =>
        fetch(`/api/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent_id: currentUserId })
        })
      ));
      alert("Students assigned.");
      assignForm.style.display = "none";
      loadAssignedStudents(currentUserId);
    } catch (err) {
      console.error("Failed to assign students:", err);
      alert("Error assigning students.");
    }
  });

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  loadUserProfile();
});
