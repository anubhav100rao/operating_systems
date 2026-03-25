import { advancedQuestions, categories, totalQuestions } from "./data/categories";

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[`'"?.,:/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("question bank", () => {
  test("exports shared totals that match the category data", () => {
    const countedQuestions = categories.reduce(
      (sum, category) => sum + category.questions.length,
      0
    );
    const countedAdvancedQuestions = categories.reduce(
      (sum, category) =>
        sum +
        category.questions.filter((question) => question.difficulty === "advanced")
          .length,
      0
    );

    expect(totalQuestions).toBe(countedQuestions);
    expect(advancedQuestions).toBe(countedAdvancedQuestions);
  });

  test("does not expose duplicate question titles", () => {
    const titles = categories.flatMap((category) =>
      category.questions.map((question) => normalizeTitle(question.title))
    );
    const uniqueTitles = new Set(titles);

    expect(uniqueTitles.size).toBe(titles.length);
  });

  test("assigns sequential problem numbers and solution paths for all 106 problems", () => {
    const questions = categories.flatMap((category) => category.questions);

    expect(questions.map((question) => question.problemNumber)).toEqual(
      Array.from({ length: 106 }, (_, index) => index + 1)
    );

    expect(questions.every((question) => question.solutionPath)).toBe(true);
  });
});
