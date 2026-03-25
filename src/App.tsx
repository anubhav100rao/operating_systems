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
import "./App.css";

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
