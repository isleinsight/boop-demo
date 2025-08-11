 // Mobile nav
    const hamburger = document.querySelector(".hamburger");
    const navRight = document.querySelector(".nav-right");
    const dropbtn = document.querySelector(".nav-dropdown .dropbtn");
    const dropdownContent = document.querySelector(".dropdown-content");

    hamburger?.addEventListener("click", () => {
      const active = hamburger.classList.toggle("active");
      navRight.classList.toggle("active", active);
      hamburger.setAttribute("aria-expanded", active ? "true" : "false");
    });

    dropbtn?.addEventListener("click", (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        dropdownContent?.classList.toggle("active");
      }
    });

    navRight?.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        hamburger?.classList.remove("active");
        navRight.classList.remove("active");
        dropdownContent?.classList.remove("active");
      });
    });
  });
