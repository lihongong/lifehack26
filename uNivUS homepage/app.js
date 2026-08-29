/*
 * Change only these three values to customize the integration tile.
 * `icon` accepts a local image path or an HTTPS image URL.
 */
const customApp = {
  name: "Hackathon App",
  icon: "assets/hackathon-app.svg",
  url: "http://127.0.0.1:3000/",
};

function isSafeWebUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function configureCustomApp(config) {
  const link = document.querySelector("#custom-app");
  const name = document.querySelector("#custom-app-name");
  const icon = document.querySelector("#custom-app-icon");
  const iconFrame = icon.closest(".custom-icon-frame");

  const label = String(config.name || "Custom Link").trim() || "Custom Link";
  name.textContent = label;
  link.setAttribute("aria-label", `Open ${label} in a new tab`);

  icon.addEventListener("load", () => iconFrame.classList.remove("is-missing"));
  icon.addEventListener("error", () => iconFrame.classList.add("is-missing"));
  icon.src = String(config.icon || "").trim();

  if (isSafeWebUrl(config.url)) {
    link.href = config.url;
  } else {
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
    link.title = "Set a valid HTTP or HTTPS URL in app.js";
    link.addEventListener("click", (event) => event.preventDefault());
  }
}

configureCustomApp(customApp);

document.querySelectorAll('.bottom-nav a[href="#"]').forEach((link) => {
  link.addEventListener("click", (event) => event.preventDefault());
});
