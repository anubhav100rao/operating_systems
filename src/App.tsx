import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useLocation,
} from "react-router-dom";
import { categories, totalQuestions } from "./data/categories";
import { HomePage } from "./pages/HomePage";
import { CategoryPage } from "./pages/CategoryPage";
import { QuestionPage } from "./pages/QuestionPage";
import { ThemeToggle } from "./components/ThemeToggle";
import "./App.css";

type AppliedTheme = "light" | "dark";
type ThemeMode = "system" | AppliedTheme;

function getSystemTheme(): AppliedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function getNextThemeMode(themeMode: ThemeMode): ThemeMode {
  if (themeMode === "system") {
    return "light";
  }

  if (themeMode === "light") {
    return "dark";
  }

  return "system";
}

function useTheme(): [ThemeMode, AppliedTheme, () => void] {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [systemTheme, setSystemTheme] = useState<AppliedTheme>(() => getSystemTheme());
  const appliedTheme = themeMode === "system" ? systemTheme : themeMode;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    setSystemTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appliedTheme);
    document.documentElement.setAttribute("data-theme-mode", themeMode);
    localStorage.setItem("theme", themeMode);
  }, [appliedTheme, themeMode]);

  const cycleTheme = () => {
    setThemeMode((prev) => getNextThemeMode(prev));
  };

  return [themeMode, appliedTheme, cycleTheme];
}

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeMode, appliedTheme, cycleTheme] = useTheme();
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo">
          <span className="logo-icon">&gt;_</span> OS Concepts
        </Link>
        <nav className="sidebar-nav">
          {categories.map((cat) => (
            <NavLink
              key={cat.id}
              to={`/category/${cat.id}`}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
              }
              style={{ "--cat-color": cat.color } as React.CSSProperties}
            >
              <span className="sidebar-link-icon">{cat.icon}</span>
              <span className="sidebar-link-text">{cat.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>
            {categories.length} categories &middot; {totalQuestions} questions
          </span>
          <ThemeToggle
            themeMode={themeMode}
            appliedTheme={appliedTheme}
            onToggle={cycleTheme}
          />
        </div>
      </aside>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        <span />
        <span />
        <span />
      </button>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/category/:categoryId" element={<CategoryPage />} />
          <Route
            path="/category/:categoryId/question/:questionId"
            element={<QuestionPage />}
          />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
