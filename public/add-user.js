document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ add-user.js loaded");

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
  const statusDiv = document.getElementById("formStatus");
  const logoutBtn = document.getElementById("logoutBtn");

  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const studentSchoolName = document.getElementById("studentSchoolName");
  const studentGradeLevel = document.getElementById("studentGradeLevel");
  const expiryDateInput = document.getElementById("expiryDate");

const updateConditionalFields = () => {
  const role = roleSelect.value;

  vendorFields.style.display = role === "vendor" ? "block" : "none";
  studentFields.style.display = role === "student" ? "block" : "none";
  assistanceContainer.style.display = role === "cardholder" ? "block" : "none";

  // ✅ Toggle required only if student is selected
  studentSchoolName.required = role === "student";
  expiryDateInput.required = role === "student";
};

  roleSelect.addEventListener("change", updateConditionalFields);
  updateConditionalFields();

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
    const middle_name = middleNameInput.value.trim() || null;
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
      middle_name,
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

    try {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid,
      wallet_id: selectedUser.wallet_id,
      issued_by: admin?.id,
      type: "spending"
    })
  });

  const result = await res.json();

  if (!res.ok) {
    const backendMessage = result?.message || "Failed to assign card";
    throw new Error(backendMessage);
  }

  statusEl.textContent = "✅ Card assigned successfully!";
  statusEl.style.color = "green";
  cardUID.value = "";
  userSearch.value = "";
  selectedUser = null;
} catch (err) {
  console.error("❌ Error:", err);
  statusEl.textContent = `❌ ${err.message}`;
  statusEl.style.color = "red";
}
  });
});
