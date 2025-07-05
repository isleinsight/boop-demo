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

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  if (!currentUserId) {
    alert("User ID not found.");
    window.location.href = "view-users.html";
  }

  let currentUserData = null;

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

        ${walletHTML}
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

      editBtn.onclick = () => {
        document.getElementById("viewFirstName").style.display = "none";
        document.getElementById("viewLastName").style.display = "none";
        document.getElementById("viewEmail").style.display = "none";

        document.getElementById("editFirstName").style.display = "block";
        document.getElementById("editLastName").style.display = "block";
        document.getElementById("editEmail").style.display = "block";

        saveBtn.style.display = "inline-block";
      };

      saveBtn.onclick = async () => {
        await fetch(`/api/users/${currentUserId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: document.getElementById("editFirstName").value,
            last_name: document.getElementById("editLastName").value,
            email: document.getElementById("editEmail").value
          })
        });
        alert("Profile updated.");
        loadUserProfile();
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

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "index.html";
    });
  });

  loadUserProfile();
});
