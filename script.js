(() => {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  document.documentElement.classList.add("js");

  const reveals = document.querySelectorAll("[data-reveal]");
  const titles = document.querySelectorAll("[data-title]");

  const markVisible = (el) => el.classList.add("is-visible");
  const markDrawn = (el) => el.classList.add("is-drawn");

  const alreadyInView = (el, ratio = 0.92) => {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight * ratio && rect.bottom > 0;
  };

  if (!reduceMotion && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          markVisible(entry.target);
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
    );

    reveals.forEach((el) => {
      if (alreadyInView(el)) markVisible(el);
      else revealObserver.observe(el);
    });

    const titleObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          markDrawn(entry.target);
          titleObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.35 }
    );

    titles.forEach((el) => {
      if (alreadyInView(el, 0.85)) markDrawn(el);
      else titleObserver.observe(el);
    });

    /* Safety net: never leave content invisible after load */
    window.setTimeout(() => {
      reveals.forEach((el) => {
        if (!el.classList.contains("is-visible")) markVisible(el);
      });
      titles.forEach((el) => {
        if (!el.classList.contains("is-drawn")) markDrawn(el);
      });
    }, 2500);
  } else {
    reveals.forEach(markVisible);
    titles.forEach(markDrawn);
  }

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
