"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "graffiti-theme";

type ThemeMode = "light" | "dark";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme =
    window.localStorage.getItem(STORAGE_KEY) ??
    window.localStorage.getItem("reflekt-theme") ??
    window.localStorage.getItem("mirur-theme");

  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleToggle = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      suppressHydrationWarning
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === "dark" ? "☀" : "☾"}
      </span>
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
