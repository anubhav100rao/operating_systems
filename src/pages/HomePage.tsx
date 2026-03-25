import { useState } from "react";
import { advancedQuestions, categories, totalQuestions } from "../data/categories";
import { CategoryCard } from "../components/CategoryCard";

export function HomePage() {
  const [search, setSearch] = useState("");

  const filtered = search
    ? categories.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.questions.some((q) =>
            q.title.toLowerCase().includes(search.toLowerCase())
          )
      )
    : categories;

  return (
    <div className="page">
      <header className="hero">
        <h1 className="hero-title">OS Concepts</h1>
        <p className="hero-subtitle">
          Master operating system internals through focused study questions
        </p>
        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-number">{categories.length}</span>
            <span className="stat-label">Categories</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{totalQuestions}</span>
            <span className="stat-label">Questions</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{advancedQuestions}</span>
            <span className="stat-label">Advanced</span>
          </div>
        </div>
        <div className="search-wrapper">
          <input
            type="text"
            placeholder="Search categories or questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
      </header>
      <div className="category-grid">
        {filtered.map((cat) => (
          <CategoryCard key={cat.id} category={cat} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="empty">No categories match your search.</p>
      )}
    </div>
  );
}
