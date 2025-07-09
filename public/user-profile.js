document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const parentSection = document.getElementById("parentSection");
  const studentInfoSection = document.getElementById("studentInfoSection");

  const schoolDisplay = document.getElementById("studentSchoolName");
  const gradeDisplay = document.getElementById("studentGradeLevel");
  const expiryDisplay = document.getElementById("studentExpiryDate");
  const enrolledDisplay = document.getElementById("studentEnrolled");

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
        await loadStudentInfo(user.id);
        await loadParentInfo(user.id);
        studentInfoSection.style.display = "block";
      } else if (user.role === "parent") {
        await loadAssignedStudents(user.id);
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
      enrolledDisplay.style.display = enable ? "none" : "inline";

      if (schoolInput && gradeInput && expiryInput) {
        schoolInput.style.display = enable ? "inline-block" : "none";
        gradeInput.style.display = enable ? "inline-block" : "none";
        expiryInput.style.display = enable ? "inline-block" : "none";
      }
    }

    saveBtn.style.display = enable ? "inline-block" : "none";
    editBtn.style.display = enable ? "none" : "inline-block";
  }

  async function loadStudentInfo(studentId) {
    try {
      const student = await fetchJSON(`/api/students/${studentId}`);
      schoolDisplay.textContent = student.school_name || "-";
      gradeDisplay.textContent = student.grade || "-";
      enrolledDisplay.textContent = student.enrolled ? "Yes" : "No";
      expiryDisplay.textContent = student.school_expiry_date || "-";

      if (schoolInput && gradeInput && expiryInput) {
        schoolInput.value = student.school_name || "";
        gradeInput.value = student.grade || "";
        expiryInput.value = student.school_expiry_date || "";
      }
    } catch (err) {
      console.warn("Student info not found.");
    }
  }

  async function loadParentInfo(studentId) {
    try {
      const parent = await fetchJSON(`/api/students/parent-of/${studentId}`);
      if (parent && parent.first_name) {
        parentSection.style.display = "block";
        document.getElementById("parentName").textContent = `${parent.first_name} ${parent.last_name}`;
        document.getElementById("parentEmail").textContent = parent.email;
      }
    } catch (err) {
      console.warn("No parent found for student.");
    }
  }

  async function loadAssignedStudents(parentId) {
    try {
      const students = await fetchJSON(`/api/students/parent/${parentId}`);
      if (students.length > 0) {
        const container = document.getElementById("studentInfoSection");
        container.innerHTML = `<div class="section-title">Student Info</div>`; // clear and add title

        students.forEach(student => {
          const block = document.createElement("div");
          block.classList.add("user-details-grid");
          block.innerHTML = `
            <div><span class="label">School Name</span><span class="value">${student.school_name || "-"}</span></div>
            <div><span class="label">Grade Level</span><span class="value">${student.grade || "-"}</span></div>
            <div><span class="label">Enrolled</span><span class="value">${student.enrolled ? "Yes" : "No"}</span></div>
            <div><span class="label">Expiry Date</span><span class="value">${student.school_expiry_date || "-"}</span></div>
          `;
          container.appendChild(block);
        });
      }
    } catch (err) {
      console.warn("No assigned students found for parent.");
    }
  }

  async function saveProfileChanges() {
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
