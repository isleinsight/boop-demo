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

      if (user.role === "parent") {
        addStudentBtn.style.display = "inline-block";
        studentSection.style.display = "block";
        loadAssignedStudents(user.id);
      }

      if (user.role === "student" && user.parent_id) {
        parentSection.style.display = "block";
        const parent = await fetchJSON(`/api/users/${user.parent_id}`);
        parentNameEl.innerHTML = `<a href="user-profile.html" onclick="localStorage.setItem('selectedUserId','${parent.id}')">${parent.first_name} ${parent.last_name}</a>`;
        parentEmailEl.textContent = parent.email;
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
        document.getElementById("viewFirstName").style.display = "none";
        document.getElementById("viewLastName").style.display = "none";
        document.getElementById("viewEmail").style.display = "none";
        document.getElementById("viewAssistance").style.display = "none";

        document.getElementById("editFirstName").style.display = "block";
        document.getElementById("editLastName").style.display = "block";
        document.getElementById("editEmail").style.display = "block";
        document.getElementById("editAssistance").style.display = "block";

        saveBtn.style.display = "inline-block";
      };

      saveBtn.onclick = async () => {
        try {
          await fetch(`/api/users/${currentUserId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              first_name: document.getElementById("editFirstName").value,
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
      alert("Failed to load user.");
      window.location.href = "view-users.html";
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
    assignStudentForm.style.display = assignStudentForm.style.display === "none" ? "block" : "none";
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
      await fetch(`/api/users/${checkbox.value}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: currentUserId })
      });
    }
    assignStudentForm.style.display = "none";
    loadAssignedStudents(currentUserId);
  });

  async function loadStudentSearchResults() {
    const query = studentSearchInput.value.trim();
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&role=cardholder&page=${currentPage}`);
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
