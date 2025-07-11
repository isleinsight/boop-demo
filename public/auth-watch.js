document.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(localStorage.getItem("boopUser"));

  if (!user || user.role !== "admin") {
    console.log("Unauthorized access – redirecting");
    window.location.href = "index.html";
  } else {
    console.log("Access granted – admin verified");
  }
});
