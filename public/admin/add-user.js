document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ add-user.js loaded");

  const token = localStorage.getItem("boop_jwt");
  if (!token) {
    console.warn("🔐 No token found. Redirecting to login.");
    window.location.href = "login.html";
    return;
  }

  const form = document.getElementById("addUserForm");
  const roleSelect = document.getElementById("role");
  const adminTypeContainer = document.getElementById("adminTypeContainer");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const firstNameInput = document.getElementById("firstName");
  const middleNameInput = document.getElementById("middleName");
  const lastNameInput = document.getElementById("lastName");
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

  // Hide/disable the password field (we'll generate a temp one)
  const pwLabel = document.querySelector('label[for="password"]');
  if (pwLabel) pwLabel.style.display = "none";
  if (passwordInput) {
    passwordInput.disabled = true;
    passwordInput.style.display = "none";
  }

  // Strong, unguessable temp password
  function generateTempPassword(length = 20) {
    const alphabet =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{};:,.<>?";
    // Use secure RNG if available
    if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(length);
      window.crypto.getRandomValues(array);
      let pw = "";
      for (let i = 0; i < length; i++) pw += alphabet[array[i] % alphabet.length];
      return pw;
    }
    // Fallback (less ideal)
    let pw = "";
    for (let i = 0; i < length; i++) {
      pw += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return pw;
  }

  let currentUserType = null;

  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const user = await res.json();
    currentUserType = user.type;

    if (["viewer", "support"].includes(currentUserType)) {
      alert("You do not have permission to access this page.");
      window.location.href = "login.html";
      return;
    }
  } catch (e) {
    console.error("Failed to fetch current user info:", e);
  }

  // Role options
  const baseRoles = [
    { value: "student", label: "Student" },
    { value: "parent", label: "Parent" },
    { value: "senior", label: "Senior" },
    { value: "vendor", label: "Vendor" },
    { value: "cardholder", label: "Cardholder" }
  ];
  if (currentUserType === "super_admin") {
    baseRoles.unshift({ value: "admin", label: "Admin" });
  }

  // Populate role dropdown
  roleSelect.innerHTML =
    `<option value="">Select Role</option>` +
    baseRoles.map((r) => `<option value="${r.value}">${r.label}</option>`).join("");

  // Conditional fields
  const updateConditionalFields = () => {
    const role = roleSelect.value;
    vendorFields.style.display = role === "vendor" ? "block" : "none";
    studentFields.style.display = role === "student" ? "block" : "none";
    assistanceContainer.style.display = role === "cardholder" ? "block" : "none";
    adminTypeContainer.style.display = role === "admin" ? "block" : "none";
    studentSchoolName.required = role === "student";
    expiryDateInput.required = role === "student";
  };
  roleSelect.addEventListener("change", updateConditionalFields);
  updateConditionalFields();

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("boopUser");
      localStorage.removeItem("boop_jwt");
      window.location.href = "login.html";
    });
  }

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusDiv.textContent = "Creating user...";
    statusDiv.style.color = "black";

    const email = emailInput.value.trim();
    const first_name = firstNameInput.value.trim();
    const middle_name = (middleNameInput.value || "").trim() || null;
    const last_name = lastNameInput.value.trim();
    const role = roleSelect.value;
    const on_assistance = onAssistanceCheckbox.checked;
    const adminType = document.getElementById("adminType")?.value || null;

    // Basic required fields (no password required here anymore)
    if (!email || !first_name || !last_name || !role) {
      statusDiv.textContent = "Please fill in all required fields.";
      statusDiv.style.color = "red";
      return;
    }

    // Generate unguessable temp password
    const tempPw = generateTempPassword(22);

    const userPayload = {
      email,
      password: tempPw, // 👈 temp password saved in DB
      first_name,
      middle_name,
      last_name,
      role,
      on_assistance: role === "cardholder" ? on_assistance : false,
      type: role === "admin" ? adminType : null
    };

    if (role === "vendor") {
      userPayload.vendor = {
        name: businessNameInput.value.trim(),
        phone: vendorPhoneInput.value.trim(),
        category: vendorCategoryInput.value.trim(),
        approved: vendorApprovedSelect ? vendorApprovedSelect.value === "true" : false
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
      userPayload.student = { school_name, grade_level, expiry_date };
    }

    try {
      // Create user
      const resUser = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(userPayload)
      });
      const result = await resUser.json();
      if (!resUser.ok) throw new Error(result.message || "Failed to create user");

      // (Optional) Create transit wallet
      try {
        const resTransit = await fetch("/api/transit-wallets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ user_id: result.user.id })
        });
        if (!resTransit.ok) {
          console.warn("🟡 Transit wallet creation failed:", await resTransit.text());
        } else {
          console.log("✅ Transit wallet created.");
        }
      } catch (err) {
        console.error("❌ Failed to create transit wallet:", err);
      }

      // Immediately send reset email to new user
      try {
        const resReset = await fetch("/api/password/admin/initiate-reset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ user_id: result.user.id })
        });
        if (!resReset.ok) {
          console.warn("🟡 Could not send reset email:", await resReset.text());
          statusDiv.textContent =
            "User created. (Reset email could not be sent — check email setup.)";
          statusDiv.style.color = "#b45309"; // amber
        } else {
          statusDiv.textContent = "✅ User created and reset email sent.";
          statusDiv.style.color = "green";
        }
      } catch (err) {
        console.error("❌ Reset initiation failed:", err);
        statusDiv.textContent =
          "User created. (Reset email failed — check server email config.)";
        statusDiv.style.color = "#b45309";
      }

      // Reset form UI
      form.reset();
      updateConditionalFields();

      // Add “Add Another User” button if not present
      let addBtn = document.getElementById("addAnotherBtn");
      if (!addBtn) {
        addBtn = document.createElement("button");
        addBtn.id = "addAnotherBtn";
        addBtn.type = "button";
        addBtn.textContent = "Add Another User";
        addBtn.style.marginTop = "10px";
        addBtn.style.display = "inline-block";
        addBtn.style.padding = "10px";
        addBtn.style.width = "100%";
        addBtn.style.fontSize = "1rem";
        addBtn.style.cursor = "pointer";
        statusDiv.insertAdjacentElement("afterend", addBtn);
        addBtn.addEventListener("click", () => {
          statusDiv.textContent = "";
          statusDiv.style.color = "";
          addBtn.remove();
          form.reset();
          updateConditionalFields();
        });
      }
    } catch (err) {
      console.error("❌ Error:", err);
      statusDiv.textContent = err.message;
      statusDiv.style.color = "red";
    }
  });

  // Clear status on input
  document.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", () => {
      statusDiv.textContent = "";
    });
  });
});
