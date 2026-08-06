(function () {
  try {
    var stored = localStorage.getItem("buildstory-theme");
    var preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = stored || preferred;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
