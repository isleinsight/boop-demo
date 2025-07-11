export function authWatch(requiredRoles = []) {
  const user = JSON.parse(localStorage.getItem("boopUser"));

  // 🚫 Not logged in
  if (!user) {
    alert("Please log in to access this page.");
    window.location.href = "login.html";
    return;
  }

  // ❌ Role mismatch
  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    alert("You don’t have permission to access this page.");
    window.location.href = "unauthorized.html"; // or dashboard.html
    return;
  }

  // ✅ All good
  return user;
}
