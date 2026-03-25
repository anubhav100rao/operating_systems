import { useParams, Navigate } from "react-router-dom";
import { categories } from "../data/categories";
import { QuestionCard } from "../components/QuestionCard";
import { Breadcrumb } from "../components/Breadcrumb";

export function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category = categories.find((c) => c.id === categoryId);

  if (!category) return <Navigate to="/" replace />;

  const diffCounts = { beginner: 0, intermediate: 0, advanced: 0 };
  category.questions.forEach((q) => {
    if (q.difficulty) diffCounts[q.difficulty]++;
  });

  return (
    <div className="page" data-category={category.id}>
      <Breadcrumb
        crumbs={[
          { label: "Home", to: "/" },
          { label: category.name },
        ]}
      />
      <div
        className="category-banner"
        style={{ "--cat-color": category.color } as React.CSSProperties}
      >
        <div className="banner-title-row">
          <span className="category-icon-large">{category.icon}</span>
          <h1>{category.name}</h1>
        </div>
        <p>{category.description}</p>
        <div className="difficulty-summary">
          {diffCounts.beginner > 0 && (
            <span className="diff-pill beginner">
              <span className="diff-dot" /> {diffCounts.beginner} Beginner
            </span>
          )}
          {diffCounts.intermediate > 0 && (
            <span className="diff-pill intermediate">
              <span className="diff-dot" /> {diffCounts.intermediate} Intermediate
            </span>
          )}
          {diffCounts.advanced > 0 && (
            <span className="diff-pill advanced">
              <span className="diff-dot" /> {diffCounts.advanced} Advanced
            </span>
          )}
        </div>
      </div>
      <div className="question-list">
        {category.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            categoryId={category.id}
            categoryColor={category.color}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}
