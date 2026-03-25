import { useEffect, useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import MarkdownIt from "markdown-it";
import { categories } from "../data/categories";
import { Breadcrumb } from "../components/Breadcrumb";

const difficultyColor: Record<string, string> = {
  beginner: "#22c55e",
  intermediate: "#eab308",
  advanced: "#ef4444",
};
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
});

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + "..." : str;
}

export function QuestionPage() {
  const { categoryId, questionId } = useParams<{
    categoryId: string;
    questionId: string;
  }>();
  const [showAnswer, setShowAnswer] = useState(true);
  const [solutionContent, setSolutionContent] = useState<string | undefined>();
  const [isLoadingSolution, setIsLoadingSolution] = useState(false);

  const category = categories.find((c) => c.id === categoryId);
  const qIndex = category?.questions.findIndex((q) => q.id === questionId) ?? -1;
  const question = qIndex >= 0 && category ? category.questions[qIndex] : undefined;

  useEffect(() => {
    let isCancelled = false;

    if (!question) {
      setSolutionContent(undefined);
      setIsLoadingSolution(false);
      return () => {
        isCancelled = true;
      };
    }

    if (question.content) {
      setSolutionContent(question.content);
      setIsLoadingSolution(false);
      return () => {
        isCancelled = true;
      };
    }

    if (!question.solutionPath) {
      setSolutionContent(undefined);
      setIsLoadingSolution(false);
      return () => {
        isCancelled = true;
      };
    }

    setIsLoadingSolution(true);
    setSolutionContent(undefined);

    fetch(`${process.env.PUBLIC_URL}${question.solutionPath}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load solution for problem ${question.problemNumber}`);
        }

        return response.text();
      })
      .then((content) => {
        if (!isCancelled) {
          setSolutionContent(content);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSolutionContent(undefined);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingSolution(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [question]);

  if (!category) return <Navigate to="/" replace />;
  if (!question) return <Navigate to={`/category/${categoryId}`} replace />;

  const prev = qIndex > 0 ? category.questions[qIndex - 1] : null;
  const next =
    qIndex < category.questions.length - 1
      ? category.questions[qIndex + 1]
      : null;
  const displayContent = question.content ?? solutionContent;
  const renderedContent = displayContent ? markdown.render(displayContent) : "";

  return (
    <div
      className="page"
      style={{ "--cat-color": category.color } as React.CSSProperties}
    >
      <Breadcrumb
        crumbs={[
          { label: "Home", to: "/" },
          { label: category.name, to: `/category/${category.id}` },
          { label: question.problemNumber ? `Problem ${question.problemNumber}` : `Question ${qIndex + 1}` },
        ]}
      />

      <div className="question-position">
        {question.problemNumber ? `Problem ${question.problemNumber}` : `Question ${qIndex + 1}`}
        {" · "}
        Question {qIndex + 1} of {category.questions.length} in {category.name}
      </div>

      <article className="question-detail">
        <div className="question-meta">
          {question.difficulty && (
            <span
              className="difficulty-badge"
              style={{
                backgroundColor: difficultyColor[question.difficulty],
              }}
            >
              {question.difficulty}
            </span>
          )}
          {question.tags?.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>

        <h1>{question.title}</h1>

        <div className="answer-section">
          <div className="answer-header">
            <h2>{displayContent || isLoadingSolution ? "Solution" : "Answer"}</h2>
            {displayContent && (
              <button
                className="answer-toggle"
                onClick={() => setShowAnswer((v) => !v)}
              >
                {showAnswer ? "Hide" : "Show"}
              </button>
            )}
          </div>

          {isLoadingSolution ? (
            <div className="no-answer">
              <div className="no-answer-icon">⏳</div>
              <h3>Loading solution</h3>
              <p>Fetching the markdown answer for this problem.</p>
            </div>
          ) : displayContent ? (
            showAnswer && (
              <div className="answer-content">
                <div
                  className="answer-markdown"
                  dangerouslySetInnerHTML={{ __html: renderedContent }}
                />
              </div>
            )
          ) : (
            <div className="no-answer">
              <div className="no-answer-icon">📝</div>
              <h3>Answer coming soon</h3>
              <p>This question hasn't been answered yet. Check back later!</p>
            </div>
          )}
        </div>
      </article>

      <nav className="question-nav">
        {prev ? (
          <Link
            to={`/category/${categoryId}/question/${prev.id}`}
            className="nav-card prev"
          >
            <small>← Previous</small>
            <span>{truncate(prev.title, 60)}</span>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            to={`/category/${categoryId}/question/${next.id}`}
            className="nav-card next"
          >
            <small>Next →</small>
            <span>{truncate(next.title, 60)}</span>
          </Link>
        ) : (
          <div />
        )}
      </nav>
    </div>
  );
}
