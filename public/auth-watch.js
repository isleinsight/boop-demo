document.addEventListener("DOMContentLoaded", () => {
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      // User not logged in – redirect to homepage
      window.location.href = "index.html";
      return;
    }

    try {
      const token = await user.getIdToken();
      const uid = user.uid;

      // Get user role from your backend
      const response = await fetch(`/api/users/${uid}`);
      if (!response.ok) throw new Error("Failed to fetch user");

      const userData = await response.json();

      // Check if user is an admin
      if (userData.role !== "admin") {
        // Not an admin – redirect
        window.location.href = "index.html";
      }

    } catch (error) {
      console.error("AuthWatch Error:", error);
      window.location.href = "index.html"; // Fail-safe redirect
    }
  });
});
