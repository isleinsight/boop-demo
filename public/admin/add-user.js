// public/admin/add-user.js
document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ add-user.js loaded (no password field)");

  // Require logged-in admin
  const token = localStorage.getItem("boop_jwt");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // Elements
  const form = document.getElementById("addUserForm");
  const roleSelect = document.getElementById("role");
  const adminTypeContainer = document.getElementById("adminTypeContainer");
  const emailInput = document.getElementById("email");
  const firstNameInput = document.getElementById("firstName");
  const middleNameInput = document.getElementById("middleName");
  const lastNameInput = document.getElementById("lastName");
  const onAssistanceCheckbox = document.getElementById("onAssistance");
  const assistanceContainer = document.getElementById("assistanceContainer");
  const vendorFields = document.getElementById("vendorFields");
  const studentFields = document.getElementById("studentFields");
  const statusDiv = document.getElementById("formStatus");
  const logoutBtn = document.getElementById("logoutBtn");

  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const studentSchoolName = document.getElementById("studentSchoolName");
  const studentGradeLevel = document.getElementById("studentGradeLevel");
  const expiryDateInput = document.getElementById("expiryDate");

  // Gate access by admin type
  let currentUserType = null;
  try {
    const meRes = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!meRes.ok) throw new Error("Unauthorized");
    const me = await meRes.json();
    currentUserType = me.type;

    if (!["super_admin", "admin"].includes(currentUserType)) {
      alert("You do not have permission to access this page.");
      localStorage.clear();
      window.location.href = "login.html";
      return;
    }
  } catch (e) {
    console.error("Failed to fetch /api/me:", e);
    localStorage.clear();
    window.location.href = "login.html";
    return;
  }

  // Build role options
  const baseRoles = [
    { value: "student", label: "Student" },
    { value: "parent", label: "Parent" },
    { value: "senior", label: "Senior" },
    { value: "vendor", label: "Vendor" },
    { value: "cardholder", label: "Cardholder" }
  ];
  if (currentUserType === "super_admin") {
    baseRoles.unshift({ value: "admin", label: "Admin" });
  }
  roleSelect.innerHTML =
    `<option value="">Select Role</option>` +
    baseRoles.map(r => `<option value="${r.value}">${r.label}</option>`).join("");

  // Toggle conditional sections
  function updateConditionalFields() {
    const role = roleSelect.value;
    vendorFields.style.display = role === "vendor" ? "block" : "none";
    studentFields.style.display = role === "student" ? "block" : "none";
    assistanceContainer.style.display = role === "cardholder" ? "block" : "none";
    adminTypeContainer.style.display = role === "admin" ? "block" : "none";

    // student requirements
    studentSchoolName.required = role === "student";
    expiryDateInput.required = role === "student";
  }
  roleSelect.addEventListener("change", updateConditionalFields);
  updateConditionalFields();

  // Logout
  logoutBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = "login.html";
  });

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusDiv.className = "status-message";
    statusDiv.textContent = "Creating user…";
    statusDiv.style.display = "block";

    const email = emailInput.value.trim();
    const first_name = firstNameInput.value.trim();
    const middle_name = (middleNameInput.value || "").trim() || null;
    const last_name = lastNameInput.value.trim();
    const role = roleSelect.value;
    const on_assistance = onAssistanceCheckbox.checked;
    const adminType = document.getElementById("adminType")?.value || null;

    if (!email || !first_name || !last_name || !role) {
      statusDiv.classList.add("error");
      statusDiv.textContent = "Please fill in all required fields.";
      return;
    }

    const payload = {
      email,
      // no password provided; backend should generate a random temp password
      first_name,
      middle_name,
      last_name,
      role,
      on_assistance: role === "cardholder" ? on_assistance : false,
      type: role === "admin" ? adminType : null
    };

    if (role === "vendor") {
      payload.vendor = {
        name: (businessNameInput.value || "").trim(),
        phone: (vendorPhoneInput.value || "").trim(),
        category: (vendorCategoryInput.value || "").trim(),
        approved: (vendorApprovedSelect?.value || "false") === "true"
      };
    }

    if (role === "student") {
      const school_name = studentSchoolName.value.trim();
      const grade_level = (studentGradeLevel.value || "").trim();
      const expiry_date = expiryDateInput.value;
      if (!school_name || !expiry_date) {
        statusDiv.classList.add("error");
        statusDiv.textContent = "Missing school name or expiry date for student.";
        return;
      }
      payload.student = { school_name, grade_level, expiry_date };
    }

    try {
      // Create user
      const resUser = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const result = await resUser.json();
      if (!resUser.ok) throw new Error(result.message || "Failed to create user");

      const newUser = result.user || result; // adjust to your API shape
      const newUserId = newUser.id;

      // (Optional) Create transit wallet (ignore failures)
      try {
        const resTransit = await fetch("/api/transit-wallets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ user_id: newUserId })
        });
        if (!resTransit.ok) {
          console.warn("Transit wallet creation failed:", await resTransit.text());
        }
      } catch (e) {
        console.warn("Transit wallet creation error:", e);
      }

      // Trigger password reset email for the new user
      try {
        const resReset = await fetch("/api/password/admin/initiate-reset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ user_id: newUserId })
        });
        if (!resReset.ok) {
          const msg = await resReset.text();
          console.warn("Password reset email failed:", msg);
        }
      } catch (e) {
        console.warn("Password reset request error:", e);
      }

      statusDiv.classList.add("success");
      statusDiv.textContent = "✅ User created. Password reset email sent.";
      form.reset();
      updateConditionalFields();

      // "Add another" helper button
      let addBtn = document.getElementById("addAnotherBtn");
      if (!addBtn) {
        addBtn = document.createElement("button");
        addBtn.id = "addAnotherBtn";
        addBtn.type = "button";
        addBtn.textContent = "Add Another User";
        addBtn.style.marginTop = "10px";
        statusDiv.insertAdjacentElement("afterend", addBtn);
        addBtn.addEventListener("click", () => {
          statusDiv.textContent = "";
          statusDiv.className = "status-message";
          addBtn.remove();
          form.reset();
          updateConditionalFields();
        });
      }
    } catch (err) {
      console.error(err);
      statusDiv.classList.add("error");
      statusDiv.textContent = err.message || "Something went wrong creating the user.";
    }
  });

  // Clear status on input changes
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", () => {
      statusDiv.textContent = "";
      statusDiv.className = "status-message";
    });
  });
});
