document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const parentSection = document.getElementById("parentSection");
  const studentInfoSection = document.getElementById("studentInfoSection");
  const parentNameEl = document.getElementById("parentName");
  const parentEmailEl = document.getElementById("parentEmail");

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  let currentUserData = null;

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
      currentUserData = user;

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
      } catch (err) {
        console.warn("No wallet/card info:", err.message);
      }

      userInfo.innerHTML = `
        <div><span class="label">First Name</span><span class="value" id="viewFirstName">${user.first_name}</span>
          <input type="text" id="editFirstName" value="${user.first_name}" style="display:none; width: 100%;" /></div>

        <div><span class="label">Middle Name</span><span class="value" id="viewMiddleName">${user.middle_name || "-"}</span>
          <input type="text" id="editMiddleName" value="${user.middle_name || ""}" style="display:none; width: 100%;" /></div>

        <div><span class="label">Last Name</span><span class="value" id="viewLastName">${user.last_name}</span>
          <input type="text" id="editLastName" value="${user.last_name}" style="display:none; width: 100%;" /></div>

        <div><span class="label">Email</span><span class="value" id="viewEmail">${user.email}</span>
          <input type="email" id="editEmail" value="${user.email}" style="display:none; width: 100%;" /></div>

        <div><span class="label">Status</span><span class="value" style="color:${user.status === "suspended" ? "red" : "green"}">${user.status}</span></div>

        <div><span class="label">Role</span><span class="value">${user.role}</span></div>

        <div>
          <span class="label">On Assistance</span>
          <span class="value" id="viewAssistance">${user.on_assistance ? "Yes" : "No"}</span>
          <select id="editAssistance" style="display:none; width: 100%;">
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

        try {
          if (action === "suspend" || action === "unsuspend") {
            const status = action === "suspend" ? "suspended" : "active";
            await fetch(`/api/users/${currentUserId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status })
            });
            alert(`User ${status}.`);
          } else if (action === "signout") {
            await fetch(`/api/users/${currentUserId}/signout`, { method: "POST" });
            alert("Sign-out requested.");
          } else if (action === "delete") {
            await fetch(`/api/users/${currentUserId}`, { method: "DELETE" });
            alert("User deleted.");
            window.location.href = "view-users.html";
            return;
          }

          await loadUserProfile();
        } catch (err) {
          console.error("❌ Action failed:", err);
          alert("Action failed.");
        }
      });
      userInfo.appendChild(dropdown);

      if (user.role === "student") {
        await loadStudentInfo(user.id);
        await loadParentInfo(user.id);
        studentInfoSection.style.display = "block";
      }

      if (user.role === "parent") {
        await loadAssignedStudents(user.id);
        studentInfoSection.style.display = "block";
      }

      if (user.role === "vendor") {
        try {
          const vendorSection = document.getElementById("vendorSection");
          const vendorData = await fetchJSON(`/api/vendors`);
          const vendor = vendorData.find(v => v.id === user.id || v.user_id === user.id);

          if (vendor) {
            document.getElementById("vendorBusiness").textContent = vendor.business_name || "-";
            document.getElementById("vendorCategory").textContent = vendor.category || "-";
            document.getElementById("vendorPhone").textContent = vendor.phone || "-";
            document.getElementById("vendorApproved").textContent = vendor.approved ? "Yes" : "No";
            vendorSection.style.display = "block";
          }
        } catch (err) {
          console.error("❌ Failed to fetch vendor info:", err);
        }
      }

      editBtn.onclick = () => {
        ["FirstName", "MiddleName", "LastName", "Email", "Assistance"].forEach(field => {
          document.getElementById(`view${field}`).style.display = "none";
          document.getElementById(`edit${field}`).style.display = "block";
        });
        saveBtn.style.display = "inline-block";
      };

      saveBtn.onclick = async () => {
        try {
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

          alert("Profile updated.");
          loadUserProfile();
        } catch (err) {
          console.error("❌ Failed to save profile:", err);
          alert("Error saving changes.");
        }
      };

    } catch (err) {
      console.error("❌ Failed to load user:", err);
      alert("Error loading user");
      window.location.href = "view-users.html";
    }
  }

  async function loadStudentInfo(studentId) {
    try {
      const student = await fetchJSON(`/api/students/${studentId}`);
      document.getElementById("studentSchoolName").textContent = student.school_name || "-";
      document.getElementById("studentGradeLevel").textContent = student.grade_level || "-";
      document.getElementById("studentEnrolled").textContent = student.enrolled ? "Yes" : "No";
      document.getElementById("studentExpiryDate").textContent = student.expiry_date || "-";
    } catch (err) {
      console.warn("❌ Could not load student info:", err);
    }
  }

  async function loadParentInfo(studentId) {
    try {
      const student = await fetchJSON(`/api/students/${studentId}`);
      if (student?.parent_ids?.length > 0) {
        const parent = await fetchJSON(`/api/users/${student.parent_ids[0]}`);
        parentSection.style.display = "block";
        parentNameEl.innerHTML = `<a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${parent.id}')">${parent.first_name} ${parent.last_name}</a>`;
        parentEmailEl.textContent = parent.email;
      }
    } catch (err) {
      console.warn("❌ Could not load parent info:", err);
    }
  }

  async function loadAssignedStudents(parentId) {
    try {
      const assignedStudentsList = document.getElementById("studentInfoSection");
      const students = await fetchJSON(`/api/students/for-parent/${parentId}`);

      if (!students.length) {
        assignedStudentsList.innerHTML += `<p style="padding: 1rem; font-style: italic;">No students assigned.</p>`;
        return;
      }

      students.forEach(student => {
        const block = document.createElement("div");
        block.classList.add("user-details-grid");
        block.innerHTML = `
          <div><span class="label">School Name</span><span class="value">${student.school_name || "-"}</span></div>
          <div><span class="label">Grade Level</span><span class="value">${student.grade_level || "-"}</span></div>
          <div><span class="label">Enrolled</span><span class="value">${student.enrolled ? "Yes" : "No"}</span></div>
          <div><span class="label">Expiry Date</span><span class="value">${student.expiry_date || "-"}</span></div>
        `;
        assignedStudentsList.appendChild(block);
      });
    } catch (err) {
      console.warn("❌ Could not load assigned students:", err);
    }
  }

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  loadUserProfile();
});
