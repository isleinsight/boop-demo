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

  let createdUserId = null;
  let createdUserEmail = null;
  let adminEmail = JSON.parse(localStorage.getItem("boopUser"))?.email || "admin@boopcard.com";

  // Hide vendor section initially
  vendorFields.style.display = "none";

  // Toggle vendor fields
  roleSelect.addEventListener("change", () => {
    vendorFields.style.display = roleSelect.value === "vendor" ? "block" : "none";
  });

  // Step 1: Create auth user
  step1Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step1Status.textContent = "Creating user...";

    const email = newEmailInput.value.trim();
    const password = newPasswordInput.value.trim();

    if (!email || !password) {
      step1Status.textContent = "❌ Email and password are required.";
      step1Status.style.color = "red";
      return;
    }

    try {
      const res = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to create user.");
      }

      createdUserId = data.userId;
      createdUserEmail = email;

      newEmailInput.disabled = true;
      newPasswordInput.disabled = true;
      step2Form.querySelectorAll("input, select, button").forEach(el => el.disabled = false);

      step1Status.textContent = "✅ Step 1 complete. Fill in step 2.";
      step1Status.style.color = "green";

    } catch (err) {
      step1Status.textContent = "❌ " + err.message;
      step1Status.style.color = "red";
    }
  });

  // Step 2: Submit profile details
  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    step2Status.textContent = "Saving user data...";

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value.toLowerCase();
    const onAssistance = onAssistanceCheckbox.checked;

    if (!createdUserId || !createdUserEmail) {
      step2Status.textContent = "❌ Please complete Step 1 first.";
      step2Status.style.color = "red";
      return;
    }

    if (!firstName || !lastName || !role) {
      step2Status.textContent = "❌ First name, last name, and role are required.";
      step2Status.style.color = "red";
      return;
    }

    const validRoles = ["admin", "student", "parent", "senior", "vendor", "cardholder"];
    if (!validRoles.includes(role)) {
      step2Status.textContent = `❌ Role must be one of: ${validRoles.join(", ")}`;
      step2Status.style.color = "red";
      return;
    }

    const userData = {
      email: createdUserEmail,
      firstName,
      lastName,
      role,
      status: "active",
      onAssistance,
      addedBy: adminEmail
    };

    try {
      const res = await fetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to save user.");
      }

      // If vendor, create vendor profile
      if (role === "vendor") {
        const vendorData = {
          userId: createdUserId,
          name: businessNameInput.value.trim(),
          phone: vendorPhoneInput.value.trim(),
          category: vendorCategoryInput.value.trim(),
          approved: vendorApprovedSelect.value === "true"
        };

        const vendorRes = await fetch("/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vendorData)
        });

        const vendorResp = await vendorRes.json();

        if (!vendorRes.ok) {
          throw new Error(vendorResp.message || "Failed to save vendor info.");
        }
      }

      step2Status.style.color = "green";
      step2Status.textContent = "✅ User successfully saved.";

      const resetButton = document.createElement("button");
      resetButton.textContent = "Add Another User";
      resetButton.style.marginTop = "20px";
      resetButton.addEventListener("click", () => {
        window.location.reload();
      });
      step2Form.appendChild(resetButton);

    } catch (err) {
      step2Status.style.color = "red";
      step2Status.textContent = "❌ " + err.message;
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
