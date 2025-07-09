document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const parentSection = document.getElementById("parentSection");
  const studentSection = document.getElementById("studentSection");
  const studentInfoSection = document.getElementById("studentInfoSection");

  const schoolDisplay = document.getElementById("studentSchool");
  const gradeDisplay = document.getElementById("studentGrade");
  const expiryDisplay = document.getElementById("studentExpiry");

  const schoolInput = document.getElementById("editStudentSchool");
  const gradeInput = document.getElementById("editStudentGrade");
  const expiryInput = document.getElementById("editStudentExpiry");

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  let currentUser = null;

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
      currentUser = user;

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
      `;

      if (user.role === "student") {
        await loadStudentInfo();
        studentSection.style.display = "block";
        studentInfoSection.style.display = "block";
      }

      editBtn.addEventListener("click", () => {
        toggleEditMode(true);
      });

      saveBtn.addEventListener("click", async () => {
        await saveProfileChanges();
        toggleEditMode(false);
        await loadUserProfile(); // reload updated values
      });

    } catch (err) {
      console.error(err);
      alert("Error loading user");
      window.location.href = "view-users.html";
    }
  }

  function toggleEditMode(enable) {
    ["FirstName", "MiddleName", "LastName", "Email"].forEach(field => {
      document.getElementById(`view${field}`).style.display = enable ? "none" : "inline";
      document.getElementById(`edit${field}`).style.display = enable ? "inline-block" : "none";
    });

    if (currentUser?.role === "student") {
      schoolDisplay.style.display = enable ? "none" : "inline";
      gradeDisplay.style.display = enable ? "none" : "inline";
      expiryDisplay.style.display = enable ? "none" : "inline";

      schoolInput.style.display = enable ? "inline-block" : "none";
      gradeInput.style.display = enable ? "inline-block" : "none";
      expiryInput.style.display = enable ? "inline-block" : "none";
    }

    saveBtn.style.display = enable ? "inline-block" : "none";
    editBtn.style.display = enable ? "none" : "inline-block";
  }

  async function loadStudentInfo() {
    const student = await fetchJSON(`/api/students/${currentUserId}`);
    schoolDisplay.textContent = student.school_name || "-";
    gradeDisplay.textContent = student.grade || "-";
    expiryDisplay.textContent = student.school_expiry_date || "-";

    schoolInput.value = student.school_name || "";
    gradeInput.value = student.grade || "";
    expiryInput.value = student.school_expiry_date || "";
  }

  async function saveProfileChanges() {
    // Update user info
    await fetch(`/api/users/${currentUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: document.getElementById("editFirstName").value,
        middle_name: document.getElementById("editMiddleName").value,
        last_name: document.getElementById("editLastName").value,
        email: document.getElementById("editEmail").value
      })
    });

    // Update student info
    if (currentUser.role === "student") {
      await fetch(`/api/students/${currentUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_name: schoolInput.value.trim(),
          grade: gradeInput.value.trim(),
          school_expiry_date: expiryInput.value.trim()
        })
      });
    }
  }

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  loadUserProfile();
});
