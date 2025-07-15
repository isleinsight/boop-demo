document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ add-user.js loaded");

  const roleSelect = document.getElementById("role");
  const adminTypeContainer = document.getElementById("adminTypeContainer");
  const form = document.getElementById("addUserForm");

  let currentUserType = null;

  try {
    const res = await fetch("/api/me");
    const user = await res.json();
    currentUserType = user.type;
  } catch (e) {
    console.error("Failed to fetch current user info:", e);
  }

  // 🧠 Dynamic role options
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

  // Populate the role select
  roleSelect.innerHTML = `<option value="">Select Role</option>` + baseRoles.map(role =>
    `<option value="${role.value}">${role.label}</option>`).join("");

  // Optional: Show admin type dropdown when 'admin' is selected
  roleSelect.addEventListener("change", () => {
    if (roleSelect.value === "admin") {
      adminTypeContainer.style.display = "block";
    } else {
      adminTypeContainer.style.display = "none";
    }
  });

});

  // Input fields
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const firstNameInput = document.getElementById("firstName");
  const middleNameInput = document.getElementById("middleName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");
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

  // ⬇️ Update dynamic field visibility and required attributes
  const updateConditionalFields = () => {
    const role = roleSelect.value;

    vendorFields.style.display = role === "vendor" ? "block" : "none";
    studentFields.style.display = role === "student" ? "block" : "none";
    assistanceContainer.style.display = role === "cardholder" ? "block" : "none";

    studentSchoolName.required = role === "student";
    expiryDateInput.required = role === "student";
  };

  roleSelect.addEventListener("change", updateConditionalFields);
  updateConditionalFields(); // initialize on load

  // 🔓 Logout handler
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("boopUser");
      localStorage.removeItem("boop_jwt");
      window.location.href = "login.html";
    });
  }

  // 📤 Form submit handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusDiv.textContent = "Creating user...";
    statusDiv.style.color = "black";

    // Collect values
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const first_name = firstNameInput.value.trim();
    const middle_name = middleNameInput.value.trim() || null;
    const last_name = lastNameInput.value.trim();
    const role = roleSelect.value;
    const on_assistance = onAssistanceCheckbox.checked;

    // Validation
    if (!email || !password || password.length < 6 || !first_name || !last_name || !role) {
      statusDiv.textContent = "Please fill in all required fields. (Password must be at least 6 characters)";
      statusDiv.style.color = "red";
      return;
    }

    // Payload
    const userPayload = {
      email,
      password,
      first_name,
      middle_name,
      last_name,
      role,
      on_assistance: role === "cardholder" ? on_assistance : false
    };

    if (role === "vendor") {
      userPayload.vendor = {
        name: businessNameInput.value.trim(),
        phone: vendorPhoneInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        approved: vendorApprovedSelect.value === "true"
      };
    }

    if (role === "student") {
      const school_name = studentSchoolName.value.trim();
      const grade_level = studentGradeLevel.value.trim();
      const expiry_date = expiryDateInput.value;

      if (!school_name || !expiry_date) {
        statusDiv.textContent = "Missing school name or expiry date for student.";
        statusDiv.style.color = "red";
        return;
      }

      userPayload.student = {
        school_name,
        grade_level,
        expiry_date
      };
    }

    // 🚀 Submit
    try {
      const resUser = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userPayload)
      });

      const result = await resUser.json();

      if (!resUser.ok) {
        throw new Error(result.message || "Failed to create user");
      }

      // 🎫 Create Transit Wallet for all users
try {
  const resTransit = await fetch("/api/transit-wallets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
body: JSON.stringify({ user_id: result.user.id })
  });

  if (!resTransit.ok) {
    const errMsg = await resTransit.text();
    console.warn("🟡 Transit wallet creation failed:", errMsg);
  } else {
    console.log("✅ Transit wallet created.");
  }
} catch (err) {
  console.error("❌ Failed to create transit wallet:", err);
}
      
      // ✅ Success!
      statusDiv.textContent = "✅ User created successfully!";
      statusDiv.style.color = "green";
      form.reset();
      updateConditionalFields();

      // 🧠 Add "Add Another User" button dynamically
      let addBtn = document.getElementById("addAnotherBtn");
      if (!addBtn) {
        addBtn = document.createElement("button");
        addBtn.id = "addAnotherBtn";
        addBtn.textContent = "Add Another User";
        addBtn.style.marginTop = "10px";
        addBtn.style.display = "inline-block";
        addBtn.style.padding = "10px";
        addBtn.style.width = "100%";
        addBtn.style.fontSize = "1rem";
        addBtn.style.cursor = "pointer";

        statusDiv.insertAdjacentElement("afterend", addBtn);

        addBtn.addEventListener("click", () => {
          statusDiv.textContent = "";
          statusDiv.style.color = "";
          addBtn.remove();
          form.reset();
          updateConditionalFields();
        });
      }

    } catch (err) {
      console.error("❌ Error:", err);
      statusDiv.textContent = err.message;
      statusDiv.style.color = "red";
    }
  });

  // Clear status message when typing in the form again
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", () => {
      statusDiv.textContent = "";
    });
  });
});
