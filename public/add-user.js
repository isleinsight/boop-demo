document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ add-user.js loaded");

  const form = document.getElementById("addUserForm");
  const statusBox = document.getElementById("formStatus");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");
  const onAssistanceCheckbox = document.getElementById("onAssistance");

  const vendorFields = document.getElementById("vendorFields");
  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  roleSelect.addEventListener("change", () => {
    vendorFields.style.display = roleSelect.value === "vendor" ? "block" : "none";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusBox.textContent = "Creating user...";
    statusBox.style.color = "black";

    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value,
      first_name: firstNameInput.value.trim(),
      last_name: lastNameInput.value.trim(),
      role: roleSelect.value,
      on_assistance: onAssistanceCheckbox.checked
    };

    if (payload.role === "vendor") {
      payload.vendor = {
        name: businessNameInput.value.trim(),
        phone: vendorPhoneInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        approved: vendorApprovedSelect.value === "true"
      };
    }

    try {
      const res = await fetch("/register-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unknown server error");

      statusBox.textContent = "✅ User successfully created!";
      statusBox.style.color = "green";
    } catch (err) {
      console.error("Error creating user:", err);
      statusBox.textContent = "❌ " + err.message;
      statusBox.style.color = "red";
    }
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("boopUser");
      window.location.href = "index.html";
    });
  }
});
