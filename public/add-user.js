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

  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const vendorFields = document.getElementById("vendorFields");
  const step1Status = document.getElementById("step1Status");
  const step2Status = document.getElementById("step2Status");

  let createdUserID = null;
  let createdUserEmail = null;

  step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = true);

  roleSelect.addEventListener("change", () => {
    if (roleSelect.value === "vendor") {
      vendorFields.style.display = "block";
    } else {
      vendorFields.style.display = "none";
    }
  });

  step1Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step1Status.textContent = "Creating user account...";

    const email = newEmailInput.value.trim();
    const password = newPasswordInput.value;

    if (!email || !password || password.length < 6) {
      step1Status.style.color = "red";
      step1Status.textContent = "❌ Please provide a valid email and password (min 6 characters)";
      return;
    }

    try {
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Account creation failed");

      createdUserID = data.user.id;
      createdUserEmail = email;

      step1Status.style.color = "green";
      step1Status.textContent = "✅ Step 1 complete. Fill in step 2.";

      newEmailInput.disabled = true;
      newPasswordInput.disabled = true;
      step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = false);

    } catch (err) {
      console.error("❌ Error creating user:", err);
      step1Status.style.color = "red";
      step1Status.textContent = "❌ " + err.message;
    }
  });

  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "Saving user details...";

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;
    const onAssistance = onAssistanceCheckbox.checked;

    if (!createdUserID || !createdUserEmail) {
      step2Status.style.color = "red";
      step2Status.textContent = "❌ Complete step 1 first.";
      return;
    }

    const userPayload = {
      id: createdUserID,
      email: createdUserEmail,
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
      const res = await fetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userPayload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "User save failed");

      step2Status.style.color = "green";
      step2Status.textContent = "✅ User successfully saved.";

      const resetBtn = document.createElement("button");
      resetBtn.textContent = "Add Another User";
      resetBtn.style.marginTop = "20px";
      resetBtn.addEventListener("click", () => window.location.reload());
      step2Form.appendChild(resetBtn);

    } catch (err) {
      console.error("❌ Error saving user details:", err);
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
