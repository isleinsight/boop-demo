document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Single-step add-user.js loaded");

  const userForm = document.getElementById("step2Form");

  const emailInput = document.getElementById("newEmail");
  const passwordInput = document.getElementById("newPassword");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");
  const onAssistanceCheckbox = document.getElementById("onAssistance");

  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");
  const vendorFields = document.getElementById("vendorFields");

  const step2Status = document.getElementById("step2Status");

  roleSelect.addEventListener("change", () => {
    vendorFields.style.display = roleSelect.value === "vendor" ? "block" : "none";
  });

  userForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "Saving user...";

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;
    const onAssistance = onAssistanceCheckbox.checked;

    if (!email || !password || password.length < 6 || !firstName || !lastName || !role) {
      step2Status.style.color = "red";
      step2Status.textContent = "❌ Please fill in all required fields. Password must be 6+ characters.";
      return;
    }

    const userPayload = {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role,
      on_assistance: onAssistance
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
      const res = await fetch("/register-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userPayload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save user");

      step2Status.style.color = "green";
      step2Status.textContent = "✅ User created successfully";

      const resetBtn = document.createElement("button");
      resetBtn.textContent = "Add Another User";
      resetBtn.style.marginTop = "20px";
      resetBtn.addEventListener("click", () => window.location.reload());
      userForm.appendChild(resetBtn);

    } catch (err) {
      console.error("❌ Error saving user:", err);
      step2Status.style.color = "red";
      step2Status.textContent = "❌ " + err.message;
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
