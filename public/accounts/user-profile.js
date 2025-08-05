document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("boop_jwt");
  const userDetails = document.getElementById("userDetails");
  const suspendBtn = document.getElementById("suspendBtn");
  const signoutBtn = document.getElementById("signoutBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const restoreBtn = document.getElementById("restoreBtn");
  const backBtn = document.getElementById("backBtn");
  let currentUser = null;
  let currentUserEmail = null;
  let selectedUser = null;

  // ✅ Restrict access to only accountant-type admins
  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData = await res.json();

    if (!meData || meData.role !== "admin" || !["accountant", "treasury", "viewer"].includes(meData.type)) {
      throw new Error("Not authorized");
    }

    currentUser = meData;
    currentUserEmail = meData.email;
  } catch (err) {
    console.warn("🔒 Not authorized or error fetching user:", err);
    localStorage.removeItem("boop_jwt");
    localStorage.removeItem("boopUser");
    window.location.href = "login.html";
    return;
  }

  async function fetchUser() {
    try {
      const userId = localStorage.getItem("selectedUserId");
      if (!userId) {
        throw new Error("No user selected");
      }

      const res = await fetch(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to fetch user: ${res.status}`);
      }
      selectedUser = await res.json();
      render();
    } catch (err) {
      console.error("⚠️ Error loading user:", err);
      userDetails.innerHTML = `<p>Error loading user: ${err.message}</p>`;
    }
  }

  async function performAction(action) {
    try {
      if (action === "delete") {
        if (selectedUser.email === currentUserEmail) return alert("You cannot delete your own account.");
        const confirmText = prompt("Type DELETE to confirm.");
        if (confirmText !== "DELETE") return;

        const res = await fetch(`/api/users/${selectedUser.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ uid: currentUser?.id })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || `Delete failed with status ${res.status}`);
        }

        alert("✅ User deleted successfully.");
        window.location.href = "view-users.html";
      } else if (action === "suspend" || action === "unsuspend") {
        const newStatus = action === "suspend" ? "suspended" : "active";
        const res = await fetch(`/api/users/${selectedUser.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
          const err = await res.json();
          return alert("❌ Failed to update status: " + (err.message || res.status));
        }

        if (newStatus === "suspended") {
          await fetch(`/api/users/${selectedUser.id}/signout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        await fetchUser();
      } else if (action === "signout") {
        const res = await fetch(`/api/users/${selectedUser.id}/signout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const err = await res.json();
          return alert("❌ Force sign-out failed: " + (err.message || res.status));
        }
        alert("✅ User signed out.");
        await fetchUser();
      } else if (action === "restore") {
        await fetch(`/api/users/${selectedUser.id}/restore`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` }
        });
        await fetchUser();
      }
    } catch (err) {
      console.error("❌ performAction failed:", err);
      alert("Action failed: " + err.message);
    }
  }

  function render() {
    if (!selectedUser) {
      userDetails.innerHTML = `<p>No user data available.</p>`;
      return;
    }

    userDetails.innerHTML = `
      <h3>User Profile</h3>
      <p><strong>First Name:</strong> ${selectedUser.first_name || "N/A"}</p>
      <p><strong>Last Name:</strong> ${selectedUser.last_name || "N/A"}</p>
      <p><strong>Email:</strong> ${selectedUser.email || "N/A"}</p>
      <p><strong>Role:</strong> ${selectedUser.role || "N/A"}</p>
      <p><strong>Status:</strong> <span style="color:${selectedUser.status === "suspended" ? "#e74c3c" : "#27ae60"}">${selectedUser.status || "N/A"}</span></p>
    `;

    // Show/hide buttons based on user status
    suspendBtn.style.display = selectedUser.deleted_at ? "none" : "inline-block";
    suspendBtn.textContent = selectedUser.status === "suspended" ? "Unsuspend" : "Suspend";
    signoutBtn.style.display = selectedUser.deleted_at ? "none" : "inline-block";
    deleteBtn.style.display = selectedUser.deleted_at ? "none" : "inline-block";
    restoreBtn.style.display = selectedUser.deleted_at ? "inline-block" : "none";
  }

  // Event listeners for action buttons
  if (suspendBtn) {
    suspendBtn.addEventListener("click", () => performAction(selectedUser.status === "suspended" ? "unsuspend" : "suspend"));
  }
  if (signoutBtn) {
    signoutBtn.addEventListener("click", () => performAction("signout"));
  }
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => performAction("delete"));
  }
  if (restoreBtn) {
    restoreBtn.addEventListener("click", () => performAction("restore"));
  }
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "view-users.html";
    });
  }

  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      fetch("/api/logout", { method: "POST" })
        .then(() => {
          localStorage.removeItem("boop_jwt");
          localStorage.removeItem("boopUser");
          window.location.href = "login.html";
        })
        .catch(() => alert("Logout failed."));
    });
  }

  await fetchUser();
});
