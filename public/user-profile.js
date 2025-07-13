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

// 🚫 Remove any accidental whitespace or malformed characters from UUID
currentUserId = currentUserId?.replace(/\s+/g, ''); 
  let currentUserData = null;
  let isEditMode = false;

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

async function loadUserProfile() {
  try {
    const userData = await fetchJSON(`/api/users/${currentUserId}`);
    currentUserData = userData;

    let walletHTML = "";

    // ✅ All Cards: Transit & Spending
    try {
      const allCards = await fetchJSON(`/api/cards?wallet_id=${userData.wallet_id || userData.wallet?.id}`);
      const transitCards = allCards.filter(c => c.type === "transit");
      const spendingCards = allCards.filter(c => c.type === "spending");

      // Show Transit Cards
      if (transitCards.length > 0) {
        transitCards.forEach(card => {
          walletHTML += `<div><span class="label">Transit Card</span><span class="value">${card.uid}</span></div>`;
        });
      } else {
        walletHTML += `<div><span class="label">Transit Card</span><span class="value">None</span></div>`;
      }

      // Show Spending Card
      if (spendingCards.length > 0) {
        spendingCards.forEach(card => {
          walletHTML += `<div><span class="label">Spending Card</span><span class="value">${card.uid}</span></div>`;
        });
      }
    } catch (err) {
      console.warn("🟡 Failed to load cards:", err.message);
      walletHTML += `<div><span class="label">Cards</span><span class="value">Failed to load</span></div>`;
    }

    userInfo.innerHTML = `
      <div><span class="label">First Name</span><span class="value" id="viewFirstName">${userData.first_name}</span>
        <input type="text" id="editFirstName" value="${userData.first_name}" style="display:none; width: 100%;" /></div>

      <div><span class="label">Middle Name</span><span class="value" id="viewMiddleName">${userData.middle_name || "-"}</span>
        <input type="text" id="editMiddleName" value="${userData.middle_name || ""}" style="display:none; width: 100%;" /></div>

      <div><span class="label">Last Name</span><span class="value" id="viewLastName">${userData.last_name}</span>
        <input type="text" id="editLastName" value="${userData.last_name}" style="display:none; width: 100%;" /></div>

      <div><span class="label">Email</span><span class="value" id="viewEmail">${userData.email}</span>
        <input type="email" id="editEmail" value="${userData.email}" style="display:none; width: 100%;" /></div>

      <div><span class="label">Status</span><span class="value" style="color:${userData.status === "suspended" ? "red" : "green"}">${userData.status}</span></div>

      <div><span class="label">Role</span><span class="value">${userData.role}</span></div>

      <div>
        <span class="label">On Assistance</span>
        <span class="value" id="viewAssistance">${userData.on_assistance ? "Yes" : "No"}</span>
        <select id="editAssistance" style="display:none; width: 100%;">
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>

      ${walletHTML}
    `;

    document.getElementById("editAssistance").value = userData.on_assistance ? "true" : "false";

    // === Action Dropdown
    const dropdown = document.createElement("select");
    dropdown.innerHTML = `
      <option value="">Actions</option>
      <option value="${userData.status === "suspended" ? "unsuspend" : "suspend"}">${userData.status === "suspended" ? "Unsuspend" : "Suspend"}</option>
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

    // === Student Role Info
    if (userData.role === "student") {
      const s = userData.student_profile;

      if (s) {
        document.getElementById("studentSchoolName").textContent = s.school_name || "-";
        document.getElementById("studentGradeLevel").textContent = s.grade_level || "-";
        document.getElementById("studentExpiryDate").textContent = s.expiry_date ? formatDatePretty(s.expiry_date) : "-";
        studentInfoSection.style.display = "block";
      }

      if (Array.isArray(userData.assigned_parents) && userData.assigned_parents.length > 0) {
        parentSection.innerHTML = `
          <div class="section-title">Parent Info</div>
          <div class="user-details-grid">
            ${userData.assigned_parents.map(p => `
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

    // === Parent Role Info
    if (userData.role === "parent" && Array.isArray(userData.assigned_students)) {
      studentInfoSection.innerHTML = '<div class="section-title">Assigned Students</div>';
      userData.assigned_students.forEach(student => {
        const block = document.createElement("div");
        block.classList.add("user-details-grid");
        block.setAttribute("data-student-id", student.id);

        block.innerHTML = `
          <div><span class="label">Name</span><span class="value">
            <a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${student.id}')">
              ${student.first_name} ${student.last_name}
            </a></span></div>
          <div><span class="label">Email</span><span class="value">${student.email}</span></div>
          <div class="remove-student-wrapper" style="display: ${isEditMode ? 'block' : 'none'};">
            <button class="remove-student-btn" data-id="${student.id}" style="margin-top: 10px; background-color: #e74c3c; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer;">
              Remove
            </button>
          </div>
        `;
        studentInfoSection.appendChild(block);
      });

      studentInfoSection.style.display = "block";
      attachRemoveListeners();
    }

    // === Vendor Info
    if (userData.role === "vendor") {
      try {
        const vendorSection = document.getElementById("vendorSection");
        const vendorData = await fetchJSON(`/api/vendors`);
        const vendor = vendorData.find(v => v.id === userData.id || v.user_id === userData.id);

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

  } catch (err) {
    console.error("❌ Failed to load user:", err);
    alert("Error loading user");
    window.location.href = "view-users.html";
  }
}

// === Edit Profile Setup ===
editBtn.onclick = () => {
  isEditMode = true;
  ["FirstName", "MiddleName", "LastName", "Email", "Assistance"].forEach(field => {
    document.getElementById(`view${field}`).style.display = "none";
    document.getElementById(`edit${field}`).style.display = "block";
  });
  saveBtn.style.display = "inline-block";

  // Show remove buttons
  document.querySelectorAll(".remove-student-wrapper").forEach(el => {
    el.style.display = "block";
  });
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

// ✅ Re-attach remove listeners *after* profile is loaded
function attachRemoveListeners() {
  document.querySelectorAll(".remove-student-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const studentId = btn.dataset.id;
      const confirmed = confirm("Are you sure you want to remove this student?");
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/students/${studentId}/parents/${currentUserId}`, {
          method: "DELETE"
        });

        if (!res.ok) throw new Error("Unlink failed");

        alert("Student removed from your account.");
        loadUserProfile();
      } catch (err) {
        console.error("❌ Remove failed:", err);
        alert("Failed to remove student.");
      }
    });
  });
}
