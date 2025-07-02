document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ add-user.js loaded");

  const step1Form = document.getElementById("step1Form");
  const step2Form = document.getElementById("step2Form");

  const newEmailInput = document.getElementById("newEmail");
  const newPasswordInput = document.getElementById("newPassword");

  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");
  const onAssistanceCheckbox = document.getElementById("onAssistance");

  const vendorFields = document.getElementById("vendorFields");
  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const step1Status = document.getElementById("step1Status");
  const step2Status = document.getElementById("step2Status");

  let createdUserEmail = null;

  // Hide vendor fields by default
  vendorFields.style.display = "none";

  roleSelect.addEventListener("change", () => {
    vendorFields.style.display = roleSelect.value === "vendor" ? "block" : "none";
  });

  step2Form.querySelectorAll("input, select, button").forEach((el) => el.disabled = true);

  // STEP 1 – Create Auth Account
  step1Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step1Status.textContent = "Creating user...";
    const email = newEmailInput.value.trim();
    const password = newPasswordInput.value.trim();

    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        step1Status.style.color = "red";
        step1Status.textContent = "❌ " + (data.message || "Unknown error during Step 1");
        return;
      }

      createdUserEmail = email;

      step1Status.style.color = "green";
      step1Status.textContent = "✅ Account created. Continue to Step 2.";
      newEmailInput.disabled = true;
      newPasswordInput.disabled = true;
      step2Form.querySelectorAll("input, select, button").forEach((el) => el.disabled = false);

    } catch (err) {
      console.error("❌ Error creating user:", err);
      step1Status.style.color = "red";
      step1Status.textContent = "❌ Network or server error.";
    }
  });

  // STEP 2 – Save User Info
  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "Saving user data...";

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;
    const onAssistance = onAssistanceCheckbox.checked;

    const userData = {
      email: createdUserEmail,
      firstName,
      lastName,
      role,
      onAssistance,
      status: "active",
      addedBy: JSON.parse(localStorage.getItem("boopUser"))?.email || "unknown"
    };

    if (role === "vendor") {
      userData.vendorDetails = {
        businessName: businessNameInput.value.trim(),
        phone: vendorPhoneInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        approved: vendorApprovedSelect.value === "true"
      };
    }

    try {
      const res = await fetch("/api/save-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
      });

      const data = await res.json();

      if (!res.ok) {
        step2Status.style.color = "red";
        step2Status.textContent = "❌ " + (data.message || "Unknown error during Step 2");
        return;
      }

      step2Status.style.color = "green";
      step2Status.textContent = "✅ User saved.";

      const resetButton = document.createElement("button");
      resetButton.textContent = "Add Another User";
      resetButton.addEventListener("click", () => window.location.reload());
      step2Form.appendChild(resetButton);

    } catch (err) {
      console.error("❌ Save error:", err);
      step2Status.style.color = "red";
      step2Status.textContent = "❌ Network or server error.";
    }
  });

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("boopUser");
      window.location.href = "index.html";
    });
  }
});
