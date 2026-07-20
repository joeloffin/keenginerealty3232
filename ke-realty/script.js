(() => {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* Fade / slide-up reveals */
  const reveals = document.querySelectorAll("[data-reveal]");
  const titles = document.querySelectorAll("[data-title]");

  if (!reduceMotion && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    reveals.forEach((el) => revealObserver.observe(el));

    const titleObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-drawn");
          titleObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.55 }
    );

    titles.forEach((el) => titleObserver.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
    titles.forEach((el) => el.classList.add("is-drawn"));
  }

  /* Subtle hero parallax */
  const heroImage = document.querySelector(".hero-image");
  if (!heroImage || reduceMotion) return;

  let ticking = false;

  const updateParallax = () => {
    const y = window.scrollY;
    const offset = Math.min(y * 0.28, 160);
    heroImage.style.transform = `translate3d(0, ${offset}px, 0)`;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateParallax);
    },
    { passive: true }
  );

  updateParallax();
})();
