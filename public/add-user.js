document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("addUserForm");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const firstNameInput = document.getElementById("firstName");
  const middleNameInput = document.getElementById("middleName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");
  const onAssistanceCheckbox = document.getElementById("onAssistance");

  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const studentSchoolName = document.getElementById("studentSchoolName");
  const studentGradeLevel = document.getElementById("studentGradeLevel");
  const expiryDateInput = document.getElementById("expiryDate");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const first_name = firstNameInput.value.trim();
    const middle_name = middleNameInput.value.trim() || null;
    const last_name = lastNameInput.value.trim();
    const role = roleSelect.value;
    const on_assistance = onAssistanceCheckbox.checked;

    if (!email || !password || password.length < 6 || !first_name || !last_name || !role) {
      alert("⚠️ Please fill in all required fields.");
      return;
    }

    const user = {
      email,
      password,
      first_name,
      middle_name,
      last_name,
      role,
      on_assistance: role === "cardholder" ? on_assistance : false,
    };

    if (role === "vendor") {
      user.vendor = {
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
        alert("⚠️ Missing required student fields.");
        return;
      }

      user.student = {
        school_name,
        grade_level,
        expiry_date
      };
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Unknown error");
      }

      alert("✅ User created: " + data.id);
      form.reset();
    } catch (err) {
      alert("❌ Error: " + err.message);
    }
  });
});
