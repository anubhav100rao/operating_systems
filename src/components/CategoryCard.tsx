import { Link } from "react-router-dom";
import { Category } from "../types";

interface Props {
  category: Category;
}

export function CategoryCard({ category }: Props) {
  const answered = category.questions.filter(
    (q) => q.content || q.solutionPath
  ).length;
  const total = category.questions.length;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <Link
      to={`/category/${category.id}`}
      className="category-card"
      style={{ "--cat-color": category.color } as React.CSSProperties}
    >
      <div className="card-top">
        <span className="category-icon">{category.icon}</span>
        <span className="question-count">{total} Q</span>
      </div>
      <h2>{category.name}</h2>
      <p>{category.description}</p>
      <div className="card-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>
          {answered}/{total}
        </span>
      </div>
    </Link>
  );
}
