document.addEventListener("DOMContentLoaded", () => {
  console.log("add-user.js loaded");

  const form = document.getElementById("addUserForm");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");
  const onAssistanceCheckbox = document.getElementById("onAssistance");

  const assistanceContainer = document.getElementById("assistanceContainer");
  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const vendorFields = document.getElementById("vendorFields");
  const statusDiv = document.getElementById("formStatus");
  const logoutBtn = document.getElementById("logoutBtn");

  // 🔧 Helper: update visibility based on role
  const updateConditionalFields = () => {
    const role = roleSelect.value;

    vendorFields.style.display = role === "vendor" ? "block" : "none";
    assistanceContainer.style.display = role === "cardholder" ? "block" : "none";
  };

  // 🔁 Attach logic to dropdown changes and call on load
  roleSelect.addEventListener("change", updateConditionalFields);
  updateConditionalFields();

  // 🧼 Clear session and logout
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("boopUser");
      localStorage.removeItem("boop_jwt");
      window.location.href = "login.html";
    });
  }

  // 🚀 Handle form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusDiv.textContent = "Creating user...";
    statusDiv.style.color = "black";

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;
    const onAssistance = onAssistanceCheckbox.checked;

    if (!email || !password || password.length < 6 || !firstName || !lastName || !role) {
      statusDiv.textContent = "Please fill in all required fields. (Password must be at least 6 characters)";
      statusDiv.style.color = "red";
      return;
    }

    const payload = {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role,
      on_assistance: role === "cardholder" ? onAssistance : false,
    };

    if (role === "vendor") {
      payload.vendor = {
        name: businessNameInput.value.trim(),
        phone: vendorPhoneInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        approved: vendorApprovedSelect.value === "true",
      };
    }

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resultText = await response.text();
      let result;
      try {
        result = JSON.parse(resultText);
      } catch (err) {
        console.error("Could not parse JSON:", resultText);
        throw new Error("Server returned invalid response.");
      }

      if (!response.ok) {
        console.error("Server error:", result);
        throw new Error(result.message || "Something went wrong.");
      }

      statusDiv.textContent = "User created successfully!";
      statusDiv.style.color = "green";

      form.reset();
      updateConditionalFields(); // hide any visible dynamic fields
    } catch (err) {
      console.error("Error creating user:", err);
      statusDiv.textContent = err.message;
      statusDiv.style.color = "red";
    }
  });
});
