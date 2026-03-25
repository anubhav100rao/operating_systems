import React from "react";

interface ThemeToggleProps {
  themeMode: "system" | "light" | "dark";
  appliedTheme: "light" | "dark";
  onToggle: () => void;
}

const nextThemeLabel = {
  system: "light",
  light: "dark",
  dark: "system",
} as const;

const themeIcon = {
  system: "🖥️",
  light: "☀️",
  dark: "🌙",
} as const;

export function ThemeToggle({
  themeMode,
  appliedTheme,
  onToggle,
}: ThemeToggleProps) {
  const modeLabel = themeMode[0].toUpperCase() + themeMode.slice(1);
  const resolvedLabel = appliedTheme[0].toUpperCase() + appliedTheme.slice(1);

  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Theme: ${modeLabel}. Click to switch to ${nextThemeLabel[themeMode]} mode.`}
      title={`Theme: ${modeLabel}. Click to switch to ${nextThemeLabel[themeMode]} mode.`}
    >
      <span className="theme-toggle-icon">{themeIcon[themeMode]}</span>
      <span className="theme-toggle-content">
        <span className="theme-toggle-label">Theme: {modeLabel}</span>
        <span className="theme-toggle-meta">
          {themeMode === "system" ? `Following ${resolvedLabel}` : "Manual override"}
        </span>
      </span>
    </button>
  );
}
