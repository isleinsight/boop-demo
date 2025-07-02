document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ add-user.js loaded");

  const step1Form = document.getElementById("step1Form");
  const step2Form = document.getElementById("step2Form");

  const newEmailInput = document.getElementById("newEmail");
  const newPasswordInput = document.getElementById("newPassword");

  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");

  const vendorFields = document.getElementById("vendorFields");
  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");
  const onAssistanceCheckbox = document.getElementById("onAssistance");

  const step1Status = document.getElementById("step1Status");
  const step2Status = document.getElementById("step2Status");

  let createdEmail = null;
  let createdPassword = null;

  const user = JSON.parse(localStorage.getItem("boopUser"));
  const adminEmail = user?.email || "admin@unknown";

  step2Form.querySelectorAll("input, select, button").forEach((el) => {
    el.disabled = true;
  });

  roleSelect.addEventListener("change", () => {
    if (roleSelect.value === "vendor") {
      vendorFields.style.display = "block";
    } else {
      vendorFields.style.display = "none";
    }
  });

  step1Form.addEventListener("submit", (e) => {
    e.preventDefault();
    step1Status.textContent = "User credentials received...";

    createdEmail = newEmailInput.value.trim();
    createdPassword = newPasswordInput.value.trim();

    if (!createdEmail || !createdPassword) {
      step1Status.style.color = "red";
      step1Status.textContent = "❌ Email and password are required.";
      return;
    }

    step1Status.style.color = "green";
    step1Status.textContent = "✅ Step 1 complete. Fill in step 2.";

    newEmailInput.disabled = true;
    newPasswordInput.disabled = true;
    step2Form.querySelectorAll("input, select, button").forEach((el) => {
      el.disabled = false;
    });
  });

  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "Submitting data...";

    const payload = {
      email: createdEmail,
      password: createdPassword,
      firstName: firstNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      role: roleSelect.value,
      onAssistance: onAssistanceCheckbox.checked,
      addedBy: adminEmail,
    };

    // Optional vendor data
    if (payload.role === "vendor") {
      payload.vendor = {
        name: businessNameInput.value.trim(),
        phone: vendorPhoneInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        approved: vendorApprovedSelect.value === "true"
      };
    }

    try {
      const res = await fetch('/add-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        step2Status.style.color = "green";
        step2Status.textContent = "✅ User created successfully.";

        const resetButton = document.createElement("button");
        resetButton.textContent = "Add Another User";
        resetButton.style.marginTop = "20px";
        resetButton.addEventListener("click", () => window.location.reload());
        step2Form.appendChild(resetButton);
      } else {
        step2Status.style.color = "red";
        step2Status.textContent = "❌ " + (data.message || "Unknown error");
      }
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
