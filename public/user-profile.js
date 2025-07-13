
document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const parentSection = document.getElementById("parentSection");
  const studentInfoSection = document.getElementById("studentInfoSection");
  const vendorSection = document.getElementById("vendorInfoSection");
  const parentNameEl = document.getElementById("parentName");
  const parentEmailEl = document.getElementById("parentEmail");
  const toast = document.getElementById("toast");

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  currentUserId = currentUserId?.replace(/\s+/g, ''); 
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

  function formatDatePretty(dateStr) {
    const date = new Date(dateStr);
    const options = { year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString("en-US", options);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.style.display = "block";
    setTimeout(() => {
      toast.style.display = "none";
    }, 3000);
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

        <div><span class="label">Email</span><span class="value">${user.email}</span></div>

        ${walletHTML}
      `;

      // ð Student Section
      if (user.role === "student") {
        studentInfoSection.style.display = "block";
        document.getElementById("studentSchoolName").textContent = user.student?.school_name || "-";
        document.getElementById("studentGradeLevel").textContent = user.student?.grade_level || "-";
        document.getElementById("studentExpiry").textContent = formatDatePretty(user.student?.expiry_date);
      } else {
        studentInfoSection.style.display = "none";
      }

      // ð§¾ Vendor Section
      if (user.role === "vendor") {
        vendorSection.style.display = "block";
        document.getElementById("vendorName").textContent = user.vendor?.name || "-";
        document.getElementById("vendorPhone").textContent = user.vendor?.phone || "-";
        document.getElementById("vendorCategory").textContent = user.vendor?.category || "-";
        document.getElementById("vendorApproved").textContent = user.vendor?.approved ? "Yes" : "No";
      } else {
        vendorSection.style.display = "none";
      }

      // ðª Parent Section
      if (user.role === "parent") {
        parentSection.style.display = "block";
        const container = document.getElementById("assignedStudentsList");
        container.innerHTML = "";

        if (Array.isArray(user.students) && user.students.length) {
          user.students.forEach(student => {
            const row = document.createElement("div");
            row.classList.add("student-row");
            row.innerHTML = `
              <span>${student.first_name} ${student.last_name}</span>
              <button class="removeStudentBtn" data-id="${student.id}" style="display: none;">Remove</button>
            `;
            container.appendChild(row);
          });
        } else {
          container.innerHTML = "<p>No students assigned.</p>";
        }
      } else {
        parentSection.style.display = "none";
      }
    } catch (err) {
      console.error("Error loading profile:", err);
      alert("Failed to load profile.");
    }
  }

  // Remove student handler
  document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("removeStudentBtn")) {
      const studentId = e.target.dataset.id;
      try {
        const res = await fetch(`/api/user-students/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUserId, student_id: studentId })
        });

        if (!res.ok) throw new Error("Failed to remove student");
        showToast("Student removed successfully.");
        await loadUserProfile(); // Refresh
        toggleEditMode(true); // Keep in edit mode
      } catch (err) {
        console.error(err);
        showToast("Failed to remove student.");
      }
    }
  });

  function toggleEditMode(editing) {
    const viewEls = document.querySelectorAll(".value");
    const editInputs = document.querySelectorAll("input[type=text]");
    viewEls.forEach(el => el.style.display = editing ? "none" : "inline-block");
    editInputs.forEach(el => el.style.display = editing ? "inline-block" : "none");

    saveBtn.style.display = editing ? "inline-block" : "none";
    editBtn.style.display = editing ? "none" : "inline-block";

    // Toggle Remove buttons
    document.querySelectorAll(".removeStudentBtn").forEach(btn => {
      btn.style.display = editing ? "inline-block" : "none";
    });
  }

  editBtn.addEventListener("click", () => toggleEditMode(true));
  saveBtn.addEventListener("click", () => toggleEditMode(false));

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("boopUser");
      window.location.href = "login.html";
    });
  }

  loadUserProfile();
});
 value="${user.middle_name || ""}" style="display:none; width: 100%;" /></div>

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

// === Student View ===
if (user.role === "student") {
  const s = user.student_profile;

  if (s) {
    document.getElementById("studentSchoolName").textContent = s.school_name || "-";
    document.getElementById("studentGradeLevel").textContent = s.grade_level || "-";
    document.getElementById("studentExpiryDate").textContent = s.expiry_date ? formatDatePretty(s.expiry_date) : "-";
    studentInfoSection.style.display = "block";
  }

  // Show parent info
  if (Array.isArray(user.assigned_parents) && user.assigned_parents.length > 0) {
    parentSection.innerHTML = `
      <div class="section-title">Parent Info</div>
      <div class="user-details-grid">
        ${user.assigned_parents.map(p => `
          <div>
            <span class="label">Name</span>
            <span class="value">
              <a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${p.id}')">
                ${p.first_name} ${p.last_name}
              </a>
            </span>
          </div>
          <div>
            <span class="label">Email</span>
            <span class="value">${p.email}</span>
          </div>
        `).join("")}
      </div>
    `;
    parentSection.style.display = "block";
  }
}
      // === Parent View ===
      if (user.role === "parent" && Array.isArray(user.assigned_students)) {
        studentInfoSection.innerHTML = '<div class="section-title">Assigned Students</div>';
        user.assigned_students.forEach(student => {
          const block = document.createElement("div");
          block.classList.add("user-details-grid");
          block.innerHTML = `
            <div><span class="label">Name</span><span class="value">
              <a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${student.id}')">
                ${student.first_name} ${student.last_name}
              </a></span></div>
            <div><span class="label">Email</span><span class="value">${student.email}</span></div>
          `;
          studentInfoSection.appendChild(block);
        });

        studentInfoSection.style.display = "block";
      }

      // === Vendor View ===
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

      // === Edit Profile Setup ===
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

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  loadUserProfile();
});
