document.addEventListener("DOMContentLoaded", () => {
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.log("Not signed in – redirecting");
      window.location.href = "index.html";
      return;
    }

    try {
      const uid = user.uid;
      const response = await fetch(`/api/users/${uid}`);
      if (!response.ok) throw new Error("Failed to fetch user info");

      const userData = await response.json();

      // ✅ Save to localStorage for pages that expect it
      localStorage.setItem("boopUser", JSON.stringify({
        id: userData.id,
        email: user.email,
        role: userData.role
      }));

      // ✅ Redirect if not an admin
      if (userData.role !== "admin") {
        console.log("User is not admin – redirecting");
        window.location.href = "index.html";
      } else {
        console.log("Admin verified – access granted");
      }

    } catch (error) {
      console.error("authWatch error:", error);
      window.location.href = "index.html";
    }
  });
});
