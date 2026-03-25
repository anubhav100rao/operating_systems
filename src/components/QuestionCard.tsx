import { Link } from "react-router-dom";
import { Question } from "../types";

interface Props {
  question: Question;
  categoryId: string;
  categoryColor: string;
  index: number;
}

const difficultyColor: Record<string, string> = {
  beginner: "#22c55e",
  intermediate: "#eab308",
  advanced: "#ef4444",
};

export function QuestionCard({ question, categoryId, categoryColor, index }: Props) {
  const hasAnswer = Boolean(question.content || question.solutionPath);
  const displayNumber = question.problemNumber ?? index + 1;

  return (
    <Link
      to={`/category/${categoryId}/question/${question.id}`}
      className="question-card"
      style={
        {
          "--cat-color": categoryColor,
          "--diff-color": question.difficulty
            ? difficultyColor[question.difficulty]
            : "#64748b",
        } as React.CSSProperties
      }
    >
      <div className="question-card-left">
        <span className="question-number">{displayNumber}</span>
      </div>
      <div className="question-card-body">
        <div className="question-header">
          {question.difficulty && (
            <span className="difficulty-indicator">
              <span
                className="difficulty-dot"
                style={{
                  backgroundColor: difficultyColor[question.difficulty],
                }}
              />
              {question.difficulty}
            </span>
          )}
          <span className={`status ${hasAnswer ? "answered" : "unanswered"}`}>
            {hasAnswer ? "Answered" : "Pending"}
          </span>
        </div>
        <h3>{question.title}</h3>
        {question.tags && question.tags.length > 0 && (
          <div className="tags">
            {question.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
