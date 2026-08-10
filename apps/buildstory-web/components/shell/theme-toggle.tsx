"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("buildstory-theme", next);
  }

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle color theme" title="Toggle color theme">
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb">
          <Sun className="theme-toggle__icon theme-toggle__icon--sun" size={8} strokeWidth={2.5} />
          <Moon className="theme-toggle__icon theme-toggle__icon--moon" size={8} strokeWidth={2.5} />
        </span>
      </span>
      <span className="theme-toggle__label">Theme</span>
    </button>
  );
}
