document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ add-user.js loaded");

  const form = document.getElementById("addUserForm");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const roleSelect = document.getElementById("role");
  const onAssistanceCheckbox = document.getElementById("onAssistance");

  const businessNameInput = document.getElementById("businessName");
  const vendorPhoneInput = document.getElementById("vendorPhone");
  const vendorCategoryInput = document.getElementById("vendorCategory");
  const vendorApprovedSelect = document.getElementById("vendorApproved");

  const vendorFields = document.getElementById("vendorFields");
  const statusDiv = document.getElementById("formStatus");

  vendorFields.style.display = "none";

  roleSelect.addEventListener("change", () => {
    vendorFields.style.display = roleSelect.value === "vendor" ? "block" : "none";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusDiv.textContent = "Creating user...";
    statusDiv.style.color = "black";

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const role = roleSelect.value;
    const onAssistance = onAssistanceCheckbox.checked;

    if (!email || !password || password.length < 6 || !firstName || !lastName || !role) {
      statusDiv.textContent = "❌ Please fill in all required fields (password must be at least 6 characters).";
      statusDiv.style.color = "red";
      return;
    }

    const payload = {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role,
      on_assistance: onAssistance,
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
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Failed to create user");
      }

      statusDiv.textContent = "✅ User created successfully.";
      statusDiv.style.color = "green";

      const resetBtn = document.createElement("button");
      resetBtn.textContent = "Add Another User";
      resetBtn.style.marginTop = "15px";
      resetBtn.addEventListener("click", () => window.location.reload());
      form.appendChild(resetBtn);
    } catch (err) {
      console.error("❌ Error:", err);
      statusDiv.textContent = "❌ " + err.message;
      statusDiv.style.color = "red";
    }
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      fetch("/api/logout", { method: "POST" }).then(() => {
        window.location.href = "login.html";
      });
    });
  }
});
