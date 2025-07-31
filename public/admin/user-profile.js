document.addEventListener("DOMContentLoaded", () => {

  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const currentAdmin = JSON.parse(localStorage.getItem("boopUser"));
if (currentAdmin?.role === "admin" && ["viewer", "accountant"].includes(currentAdmin?.type)) {
  if (editBtn) editBtn.style.display = "none";
}
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
  const token = localStorage.getItem("boop_jwt");

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (options.autoRedirect !== false) {
    window.location.href = "login.html";
    return;
  }

  const fetchOptions = {
    ...options,
    headers,
  };

  const res = await fetch(url, fetchOptions);

  if (res.status === 401 || res.status === 403) {
    console.warn("⚠️ Token rejected or expired");
    if (options.autoRedirect !== false) {
      window.location.href = "login.html";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Network error");
  }

  return await res.json();
}

  function formatDatePretty(dateStr) {
    const date = new Date(dateStr);
    const options = { year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString("en-US", options);
  }

    async function loadUserProfile() {
    try {
      const user = await fetchJSON(`/api/users/${currentUserId}`);
      currentUserData = user;

      let walletHTML = "";

// ✅ All Cards: Transit & Spending
try {
  const allCards = await fetchJSON(`/api/cards?wallet_id=${user.wallet_id || user.wallet?.id}`);
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

  // Show Spending Card (optional, remove if you want only transit)
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
  <div><span class="label">User ID</span><span class="value">${user.id}</span></div>
  
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

      // ✅ dropdown

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
  if (!action) return;

  const token = localStorage.getItem("boop_jwt");
  if (!token) {
    alert("Missing token.");
    return;
  }

  // ✅ Load current user info for email (like View Users does)
  let adminUser = null;
  try {
    const meRes = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    adminUser = await meRes.json();
  } catch (e) {
    console.warn("Failed to fetch current admin");
  }

  if (action === "delete") {
    const confirmDelete = prompt("Type DELETE to confirm.");
    if (confirmDelete !== "DELETE") return;
  }

  try {
    let res;

    if (action === "suspend" || action === "unsuspend") {
      const newStatus = action === "suspend" ? "suspended" : "active";
      res = await fetch(`/api/users/${currentUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update status");
      }

      alert(`User status updated to ${newStatus}.`);

      if (newStatus === "suspended") {
        await fetch(`/api/users/${currentUserId}/signout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }

    } else if (action === "signout") {
      res = await fetch(`/api/users/${currentUserId}/signout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Force sign-out failed");
      }

      alert("✅ User signed out.");

    } else if (action === "delete") {
      res = await fetch(`/api/users/${currentUserId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ uid: adminUser?.id }) // Just in case the backend checks this
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "User deletion failed");
      }

      alert("User deleted.");
      window.location.href = "view-users.html";
      return;
    }

    await loadUserProfile();

  } catch (err) {
    console.error("❌ Action failed:", err);
    alert("❌ Action failed: " + err.message);
  }
});

userInfo.appendChild(dropdown);

// === Student View ===
if (user.role === "student") {
  const s = user.student_profile;

  if (s) {
    studentInfoSection.innerHTML = `
  <div class="section-title">Student Info</div>

  <div style="margin-top: 10px; margin-bottom: 10px;">
    <button id="editStudentBtn" class="btnEdit">Edit Student</button>
    <button id="saveStudentBtn" class="btnEdit" style="display:none;">Save Student Info</button>
  </div>

  <div class="user-details-grid">
    <div>
      <span class="label">School</span>
      <span class="value" id="viewSchool">${s.school_name || "-"}</span>
      <input type="text" id="editSchool" value="${s.school_name || ""}" style="display:none; width: 100%;" />
    </div>

    <div>
      <span class="label">Grade</span>
      <span class="value" id="viewGrade">${s.grade_level || "-"}</span>
      <input type="text" id="editGrade" value="${s.grade_level || ""}" style="display:none; width: 100%;" />
    </div>

    <div>
      <span class="label">Expiry</span>
      <span class="value" id="viewExpiry">${s.expiry_date ? formatDatePretty(s.expiry_date) : "-"}</span>
      <input type="date" id="editExpiry" value="${s.expiry_date ? s.expiry_date.slice(0, 10) : ""}" style="display:none; width: 100%;" />
    </div>
  </div>
`;
    studentInfoSection.style.display = "block";
  // ✅ Attach Edit Student click handler
const editStudentBtn = document.getElementById("editStudentBtn");
const saveStudentBtn = document.getElementById("saveStudentBtn");

if (editStudentBtn) {
  editStudentBtn.onclick = () => {
    ["School", "Grade", "Expiry"].forEach(field => {
      const viewEl = document.getElementById(`view${field}`);
      const editEl = document.getElementById(`edit${field}`);
      if (viewEl && editEl) {
        viewEl.style.display = "none";
        editEl.style.display = "block";
      }
    });

    if (saveStudentBtn) {
      saveStudentBtn.style.display = "inline-block";
    }
  };
}

if (saveStudentBtn) {
  saveStudentBtn.onclick = async () => {
    const studentData = {
      school_name: document.getElementById("editSchool")?.value,
      grade_level: document.getElementById("editGrade")?.value,
      expiry_date: document.getElementById("editExpiry")?.value,
    };

    try {
      if (currentUserData?.student_profile) {
        await fetchJSON(`/api/students/${currentUserId}`, {
          method: "PATCH",
          body: JSON.stringify(studentData)
        });
      } else {
        await fetchJSON(`/api/students`, {
          method: "POST",
          body: JSON.stringify({
            user_id: currentUserId,
            ...studentData
          })
        });
      }

      alert("✅ Student info saved.");
      isEditMode = false;
      saveStudentBtn.style.display = "none";
      loadUserProfile();
    } catch (err) {
      console.error("❌ Failed to save student data:", err);
      alert("Failed to save student info.");
    }
  };
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

      
// === Parent View ===
if (user.role === "parent" && Array.isArray(user.assigned_students)) {
  studentInfoSection.innerHTML = '<div class="section-title">Assigned Students</div>';
  
  user.assigned_students.forEach(student => {
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

  // ✅ Attach remove listeners
  setTimeout(() => {
    document.querySelectorAll(".remove-student-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const studentId = btn.dataset.id;
        const confirmed = confirm("Are you sure you want to remove this student?");
        if (!confirmed) return;

        try {
          const res = await fetch(`/api/user-students/${studentId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parent_id: currentUserId }) // <- ensure backend expects this!
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
  }, 0);

  studentInfoSection.style.display = "block";
  const editStudentBtn = document.getElementById("editStudentBtn");
const saveStudentBtn = document.getElementById("saveStudentBtn");

editStudentBtn.onclick = () => {
  ["School", "Grade", "Expiry"].forEach(field => {
    const viewEl = document.getElementById(`view${field}`);
    const editEl = document.getElementById(`edit${field}`);
    if (viewEl && editEl) {
      viewEl.style.display = "none";
      editEl.style.display = "block";
    }
  });

  saveStudentBtn.style.display = "inline-block";
};
}

// === Vendor View ===
if (user.role === "vendor") {
  try {
    const vendorSection = document.getElementById("vendorSection");
    const vendorData = await fetchJSON(`/api/vendors`);
    const vendor = vendorData.find(v => v.id === user.id || v.user_id === user.id);

    if (vendor) {
      vendorSection.innerHTML = `
        <div class="section-title">Vendor Info</div>
        <div class="user-details-grid">
          <div>
            <span class="label">Business Name</span>
            <span class="value" id="viewBusiness">${vendor.business_name || "-"}</span>
            <input type="text" id="editBusiness" value="${vendor.business_name || ""}" style="display:none; width: 100%;" />
          </div>

          <div>
            <span class="label">Category</span>
            <span class="value" id="viewCategory">${vendor.category || "-"}</span>
            <input type="text" id="editCategory" value="${vendor.category || ""}" style="display:none; width: 100%;" />
          </div>

          <div>
            <span class="label">Phone</span>
            <span class="value" id="viewPhone">${vendor.phone || "-"}</span>
            <input type="tel" id="editPhone" value="${vendor.phone || ""}" style="display:none; width: 100%;" />
          </div>
          
        </div>
      `;
      vendorSection.style.display = "block";
    }
  } catch (err) {
    console.error("❌ Failed to fetch vendor info:", err);
  }
}
      
      // === Edit Profile Setup ===
editBtn.onclick = () => {
  isEditMode = true;

  // Toggle user input fields
  ["FirstName", "MiddleName", "LastName", "Email", "Assistance"].forEach(field => {
    const viewEl = document.getElementById(`view${field}`);
    const editEl = document.getElementById(`edit${field}`);
    if (viewEl && editEl) {
      viewEl.style.display = "none";
      editEl.style.display = "block";
    }
  });

  

  // Toggle vendor input fields
  if (currentUserData.role === "vendor") {
    ["Business", "Category", "Phone", "VendorApproved"].forEach(field => {
      const viewEl = document.getElementById(`vendor${field}`) || document.getElementById(`view${field}`);
      const editEl = document.getElementById(`editVendor${field}`) || document.getElementById(`edit${field}`);
      if (viewEl && editEl) {
        viewEl.style.display = "none";
        editEl.style.display = "block";
      }
    });
  }

  // Show save button
  saveBtn.style.display = "inline-block";

  // Show remove buttons for parents
  document.querySelectorAll(".remove-student-wrapper").forEach(el => {
    el.style.display = "block";
  });
};

saveBtn.onclick = async () => {
  let hadError = false;

  // ✅ Update user base info
  try {
    await fetchJSON(`/api/users/${currentUserId}`, {
      method: "PATCH",
      body: JSON.stringify({
        first_name: document.getElementById("editFirstName").value,
        middle_name: document.getElementById("editMiddleName").value,
        last_name: document.getElementById("editLastName").value,
        email: document.getElementById("editEmail").value,
        on_assistance: document.getElementById("editAssistance").value === "true"
      })
    });
  } catch (err) {
    hadError = true;
    console.warn("❌ User update failed:", err);
  }

  

  // ✅ Vendor update
  if (currentUserData.role === "vendor") {
    try {
      await fetchJSON(`/api/vendors/${currentUserId}`, {
        method: "PATCH",
        body: JSON.stringify({
          business_name: document.getElementById("editVendorBusiness")?.value,
          category: document.getElementById("editVendorCategory")?.value,
          phone: document.getElementById("editVendorPhone")?.value,
        })
      });
    } catch (err) {
      hadError = true;
      console.warn("❌ Vendor update failed:", err);
    }
  }

  // ✅ Final outcome
  if (hadError) {
    alert("Some changes were saved, but not all.");
  } else {
    alert("✅ All changes saved.");
    isEditMode = false;
    saveBtn.style.display = "none";

    [
      "FirstName", "MiddleName", "LastName", "Email", "Assistance",
      "School", "Grade", "Expiry",
      "Business", "Category", "Phone", "VendorApproved"
    ].forEach(field => {
      const viewEl = document.getElementById(`view${field}`) || document.getElementById(`vendor${field}`);
      const editEl = document.getElementById(`edit${field}`) || document.getElementById(`editVendor${field}`);
      if (viewEl && editEl) {
        viewEl.style.display = "inline-block";
        editEl.style.display = "none";
      }
    });

    document.querySelectorAll(".remove-student-wrapper").forEach(el => {
      el.style.display = "none";
    });

    loadUserProfile();
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
isEditMode = false;

// ✅ Check if current user has been force signed out
(async () => {
  const token = localStorage.getItem("boop_jwt");
  if (!token) return;

  try {
    const res = await fetch("/api/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;

    const user = await res.json();

    if (user.force_signed_out) {
      alert("You have been signed out by an administrator.");
      localStorage.clear();

      try {
        const sessionRes = await fetch(`/api/sessions/${user.email}`, { method: "DELETE" });

        // ignore 404 (session already gone)
        if (sessionRes.status !== 200 && sessionRes.status !== 404) {
          console.warn("🧹 Session deletion failed:", await sessionRes.text());
        }
      } catch (err) {
        console.warn("🧹 Session cleanup failed:", err);
      }

      window.location.href = "login.html";
    }
  } catch (err) {
    console.error("Force sign-out check failed:", err);
  }
})();
  
  loadUserProfile();
});
