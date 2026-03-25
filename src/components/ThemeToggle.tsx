import React from "react";

interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      <span className="theme-toggle-icon">{theme === "light" ? "🌙" : "☀️"}</span>
      <span className="theme-toggle-label">
        {theme === "light" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
