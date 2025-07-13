document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const vendorSection = document.getElementById("vendorSection");
  const parentSection = document.getElementById("parentSection");
  const studentInfoSection = document.getElementById("studentInfoSection");
  const parentNameEl = document.getElementById("parentName");
  const parentEmailEl = document.getElementById("parentEmail");
  const toast = createToastElement();

  let currentUserId = localStorage.getItem("selectedUserId") || new URLSearchParams(window.location.search).get("uid");
  currentUserId = currentUserId?.replace(/\s+/g, "");
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

  function createToastElement() {
    const toast = document.createElement("div");
    toast.id = "toast";
    toast.style.position = "fixed";
    toast.style.bottom = "30px";
    toast.style.right = "30px";
    toast.style.background = "#2ecc71";
    toast.style.color = "#fff";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "6px";
    toast.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";
    toast.style.display = "none";
    toast.style.zIndex = "9999";
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(message, color = "#2ecc71") {
    toast.textContent = message;
    toast.style.background = color;
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
        <div><span class="label">First Name</span><span class="value">${user.first_name}</span></div>
        <div><span class="label">Middle Name</span><span class="value">${user.middle_name || "-"}</span></div>
        <div><span class="label">Last Name</span><span class="value">${user.last_name}</span></div>
        <div><span class="label">Email</span><span class="value">${user.email}</span></div>
        <div><span class="label">Status</span><span class="value">${user.status}</span></div>
        <div><span class="label">Role</span><span class="value">${user.role}</span></div>
        ${walletHTML}
      `;

      if (user.role === "vendor" && user.vendor) {
        vendorSection.style.display = "block";
        document.getElementById("vendorBusiness").textContent = user.vendor.name || "-";
        document.getElementById("vendorCategory").textContent = user.vendor.category || "-";
        document.getElementById("vendorPhone").textContent = user.vendor.phone || "-";
        document.getElementById("vendorApproved").textContent = user.vendor.approved ? "Yes" : "No";
      }

      if (user.role === "student" && user.student) {
        studentInfoSection.style.display = "block";
        document.getElementById("studentSchoolName").textContent = user.student.school_name || "-";
        document.getElementById("studentGradeLevel").textContent = user.student.grade_level || "-";
        document.getElementById("studentExpiryDate").textContent = formatDatePretty(user.student.expiry_date);
      }

      if (user.role === "parent") {
        parentSection.style.display = "block";
        loadAssignedStudents(user.id);
      }

      loadTransactionHistory(user.id);

    } catch (err) {
      console.error("Error loading user:", err);
      alert("Error loading user profile.");
    }
  }

  async function loadAssignedStudents(parentId) {
    try {
      const students = await fetchJSON(`/api/user-students/${parentId}`);
      const section = document.createElement("div");
      section.classList.add("user-details-grid");
      section.id = "assignedStudentsSection";

      students.forEach(student => {
        const div = document.createElement("div");
        div.classList.add("student-entry");
        div.innerHTML = `
          <span class="label">${student.first_name} ${student.last_name}</span>
          <span class="value">${student.email}</span>
          <button class="removeStudentBtn" style="display: none;" data-student-id="${student.id}">Remove</button>
        `;
        section.appendChild(div);
      });

      parentSection.appendChild(section);
    } catch (err) {
      console.error("Failed to load assigned students", err);
    }
  }

  async function loadTransactionHistory(userId) {
    try {
      const transactions = await fetchJSON(`/api/transactions/user/${userId}`);
      const tbody = document.querySelector("#transactionTable tbody");
      tbody.innerHTML = "";

      transactions.forEach(tx => {
        const row = document.createElement("tr");
        row.innerHTML = \`
          <td>\${new Date(tx.timestamp).toLocaleString()}</td>
          <td>\${tx.amount}</td>
          <td>\${tx.from_name || "-"}</td>
          <td>\${tx.to_name || "-"}</td>
          <td>\${tx.category || "-"}</td>
          <td>\${tx.id}</td>
          <td>\${tx.status}</td>
        \`;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.warn("No transaction history found", err);
    }
  }

  editBtn.addEventListener("click", () => {
    saveBtn.style.display = "inline-block";
    editBtn.style.display = "none";
    document.querySelectorAll(".removeStudentBtn").forEach(btn => {
      btn.style.display = "inline-block";
    });
  });

  saveBtn.addEventListener("click", () => {
    saveBtn.style.display = "none";
    editBtn.style.display = "inline-block";
    document.querySelectorAll(".removeStudentBtn").forEach(btn => {
      btn.style.display = "none";
    });
  });

  document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("removeStudentBtn")) {
      const studentId = e.target.getAttribute("data-student-id");
      if (!confirm("Are you sure you want to remove this student from the parent?")) return;

      try {
        const res = await fetch("/api/user-students", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ student_id: studentId, user_id: currentUserId })
        });

        if (!res.ok) throw new Error("Failed to remove student");

        showToast("Student removed successfully");
        e.target.closest(".student-entry").remove();
      } catch (err) {
        console.error("Error removing student:", err);
        showToast("Failed to remove student", "#e74c3c");
      }
    }
  });

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/logout", { method: "POST" }).then(() => {
      localStorage.removeItem("boopUser");
      window.location.href = "login.html";
    });
  });

  loadUserProfile();
});
