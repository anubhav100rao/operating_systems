export interface Question {
  id: string;
  problemNumber?: number;
  title: string;
  content?: string;       // markdown content for the answer/explanation
  solutionPath?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  tags?: string[];
}

export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;           // emoji icon for the category
  color: string;          // accent color for the category
  questions: Question[];
}
