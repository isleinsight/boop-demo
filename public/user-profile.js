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
  const prevStudentPageBtn = document.getElementById("prevStudentPageBtn");
  const nextStudentPageBtn = document.getElementById("nextStudentPageBtn");
  const studentPaginationInfo = document.getElementById("studentPaginationInfo");
  const assignSelectedStudentsBtn = document.getElementById("assignSelectedStudentsBtn");

  let currentPage = 1;
  let totalPages = 1;
  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");

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
    try {
      const user = await fetchJSON(`/api/users/${currentUserId}`);

      let walletHTML = "";
      try {
        const wallet = await fetchJSON(`/api/wallets/user/${user.id}`);
        if (wallet?.id) {
          walletHTML += `<div><span class="label">Wallet ID</span><span class="value">${wallet.id}</span></div>`;
          const cards = await fetchJSON(`/api/cards?wallet_id=${wallet.id}`);
          if (Array.isArray(cards) && cards.length > 0) {
            walletHTML += `<div><span class="label">Card Number</span><span class="value">${cards[0].uid}</span></div>`;
          }
        }
      } catch {}

      userInfo.innerHTML = `
        <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.first_name}</span>
        <input type="text" id="editFirstName" value="${user.first_name}" style="display:none;" /></div>

        <div><span class="label">Middle Name</span><span class="value" id="viewMiddleName">${user.middle_name || "-"}</span>
        <input type="text" id="editMiddleName" value="${user.middle_name || ""}" style="display:none;" /></div>

        <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.last_name}</span>
        <input type="text" id="editLastName" value="${user.last_name}" style="display:none;" /></div>

        <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email}</span>
        <input type="email" id="editEmail" value="${user.email}" style="display:none;" /></div>

        <div><span class="label">Status</span><span class="value" style="color:${user.status === "suspended" ? "red" : "green"}">${user.status}</span></div>
        <div><span class="label">Role</span><span class="value">${user.role}</span></div>

        <div><span class="label">On Assistance</span>
          <span class="value" id="viewAssistance">${user.on_assistance ? "Yes" : "No"}</span>
          <select id="editAssistance" style="display:none;">
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>

        ${walletHTML}
      `;

      document.getElementById("editAssistance").value = user.on_assistance ? "true" : "false";

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

        if (action === "suspend" || action === "unsuspend") {
          await fetch(`/api/users/${currentUserId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: action === "suspend" ? "suspended" : "active" })
          });
        } else if (action === "signout") {
          await fetch(`/api/users/${currentUserId}/signout`, { method: "POST" });
        } else if (action === "delete") {
          await fetch(`/api/users/${currentUserId}`, { method: "DELETE" });
          window.location.href = "view-users.html";
        }

        await loadUserProfile();
      });
      userInfo.appendChild(dropdown);

      if (user.role === "parent") {
        addStudentBtn.style.display = "inline-block";
        studentSection.style.display = "block";
        loadAssignedStudents(user.id);
      }

      editBtn.onclick = () => {
        ["FirstName", "MiddleName", "LastName", "Email", "Assistance"].forEach(field => {
          document.getElementById(`view${field}`).style.display = "none";
          document.getElementById(`edit${field}`).style.display = "block";
        });
        saveBtn.style.display = "inline-block";
      };

      saveBtn.onclick = async () => {
        await fetch(`/api/users/${currentUserId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: document.getElementById("editFirstName").value,
            middle_name: document.getElementById("editMiddleName").value,
            last_name: document.getElementById("editLastName").value,
            email: document.getElementById("editEmail").value,
            on_assistance: document.getElementById("editAssistance").value === "true"
          })
        });
        await loadUserProfile();
      };
    } catch (err) {
      alert("Error loading user");
      window.location.href = "view-users.html";
    }
  }

  async function loadAssignedStudents(parentId) {
    const studentList = await fetchJSON(`/api/students/for-parent/${parentId}`);
    assignedStudentsList.innerHTML = "";

    if (!studentList.length) {
      assignedStudentsList.innerHTML = `<p style="padding: 1rem; font-style: italic;">No students assigned.</p>`;
      return;
    }

    for (const student of studentList) {
      assignedStudentsList.innerHTML += `
        <div>
          <span class="label">Name</span>
          <span class="value"><a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${student.user.id}')">${student.user.first_name} ${student.user.middle_name || ""} ${student.user.last_name}</a></span>
          <div><span class="label">School</span><span class="value">${student.school_name || "-"}</span></div>
          <div><span class="label">Expiry</span><span class="value">${student.expiry_date || "-"}</span></div>
          <button onclick="removeStudent('${student.user.id}')">Remove</button>
        </div>
      `;
    }
  }

  window.removeStudent = async function (studentId) {
    await fetch(`/api/students/remove-parent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, parent_id: currentUserId })
    });
    loadAssignedStudents(currentUserId);
  };

  addStudentBtn?.addEventListener("click", () => {
    assignStudentForm.style.display = "block";
    currentPage = 1;
    studentSearchInput.value = "";
    loadStudentSearchResults(); // auto-load
  });

  studentSearchBtn?.addEventListener("click", () => {
    currentPage = 1;
    loadStudentSearchResults();
  });

  prevStudentPageBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadStudentSearchResults();
    }
  });

  nextStudentPageBtn?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadStudentSearchResults();
    }
  });

  assignSelectedStudentsBtn?.addEventListener("click", async () => {
    const selected = document.querySelectorAll('input[name="studentSelect"]:checked');
    for (const checkbox of selected) {
      await fetch(`/api/students/assign-parent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: checkbox.value, parent_id: currentUserId })
      });
    }
    assignStudentForm.style.display = "none";
    loadAssignedStudents(currentUserId);
  });

  async function loadStudentSearchResults() {
    const query = studentSearchInput.value.trim();
    const res = await fetch(`/api/users?search=${query}&role=student&page=${currentPage}&limit=5`);
    const { users, totalPages: tp } = await res.json();
    totalPages = tp;

    studentSearchResults.innerHTML = users.map(user => `
      <tr>
        <td>${user.first_name}</td>
        <td>${user.last_name}</td>
        <td>${user.email}</td>
        <td><input type="checkbox" name="studentSelect" value="${user.id}"></td>
      </tr>
    `).join('');

    studentPaginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevStudentPageBtn.style.display = currentPage > 1 ? "inline-block" : "none";
    nextStudentPageBtn.style.display = currentPage < totalPages ? "inline-block" : "none";
  }

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  loadUserProfile();
});
