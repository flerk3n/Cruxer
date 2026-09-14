"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => setIsDark(document.documentElement.classList.contains("dark")), []);
  function toggleTheme() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("cruxer-theme", next ? "dark" : "light");
    setIsDark(next);
  }

  return <button type="button" onClick={toggleTheme} className="grid h-11 w-11 place-items-center rounded-xl text-muted-ink transition-colors hover:bg-surface-raised hover:text-ink" aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}
