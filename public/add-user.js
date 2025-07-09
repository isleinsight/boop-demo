document.addEventListener("DOMContentLoaded", () => {
  console.log("add-user.js loaded");

  const form = document.getElementById("addUserForm");

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

  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const gradeLevelInput = document.getElementById("gradeLevel");
  const schoolNameInput = document.getElementById("schoolName");

  const statusDiv = document.getElementById("formStatus");
  const logoutBtn = document.getElementById("logoutBtn");

  const updateConditionalFields = () => {
    const role = roleSelect.value;
    vendorFields.style.display = role === "vendor" ? "block" : "none";
    assistanceContainer.style.display = role === "cardholder" ? "block" : "none";
    studentFields.style.display = role === "student" ? "block" : "none";
  };

  roleSelect.addEventListener("change", updateConditionalFields);
  updateConditionalFields(); // Run once on load

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("boopUser");
      localStorage.removeItem("boop_jwt");
      window.location.href = "login.html";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusDiv.textContent = "Creating user...";
    statusDiv.style.color = "black";

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const first_name = firstNameInput.value.trim();
    const middle_name = middleNameInput.value.trim();
    const last_name = lastNameInput.value.trim();
    const role = roleSelect.value;
    const on_assistance = onAssistanceCheckbox.checked;

    if (!email || !password || password.length < 6 || !first_name || !last_name || !role) {
      statusDiv.textContent = "Please fill in all required fields. (Password must be at least 6 characters)";
      statusDiv.style.color = "red";
      return;
    }

    const userPayload = {
      email,
      password,
      first_name,
      middle_name: middle_name || null,
      last_name,
      role,
      on_assistance: role === "cardholder" ? on_assistance : false,
    };

    if (role === "vendor") {
      userPayload.vendor = {
        name: businessNameInput.value.trim(),
        phone: vendorPhoneInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        approved: vendorApprovedSelect.value === "true"
      };
    }

    try {
      const resUser = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userPayload),
      });

      const result = await resUser.json();

      if (!resUser.ok) {
        throw new Error(result.message || "Failed to create user");
      }

      // If student, also create student profile
      if (role === "student") {
        const school_name = schoolNameInput.value.trim();
        const grade_level = gradeLevelInput.value.trim();
        const expiry_date = new Date();
        expiry_date.setFullYear(expiry_date.getFullYear() + 1); // Default to 1 year from now

        if (!school_name) {
          throw new Error("School name is required for student.");
        }

        await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: result.id,
            school_name,
            grade_level,
            expiry_date: expiry_date.toISOString().split("T")[0] // Format as YYYY-MM-DD
          })
        });
      }

      statusDiv.textContent = "✅ User created successfully!";
      statusDiv.style.color = "green";
      form.reset();
      updateConditionalFields();

    } catch (err) {
      console.error("❌ Error:", err);
      statusDiv.textContent = err.message;
      statusDiv.style.color = "red";
    }
  });
});
