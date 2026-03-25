import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const docsDir = path.join(repoRoot, "docs");
const publicSolutionsDir = path.join(repoRoot, "public", "solutions");
const manifestPath = path.join(repoRoot, "src", "data", "solutionManifest.ts");
const maxProblemNumberArg = process.argv[2];
const maxProblemNumber = maxProblemNumberArg
  ? Number(maxProblemNumberArg)
  : Number.POSITIVE_INFINITY;

if (!Number.isFinite(maxProblemNumber) && maxProblemNumber !== Number.POSITIVE_INFINITY) {
  throw new Error("Provide a positive integer max problem number.");
}

if (Number.isFinite(maxProblemNumber) && (!Number.isInteger(maxProblemNumber) || maxProblemNumber < 1)) {
  throw new Error("Provide a positive integer max problem number.");
}

fs.mkdirSync(publicSolutionsDir, { recursive: true });

const copiedSolutionNumbers = fs
  .readdirSync(docsDir)
  .map((fileName) => {
    const match = /^solution_(\d+)\.md$/.exec(fileName);
    if (!match) {
      return null;
    }

    const problemNumber = Number(match[1]);
    if (problemNumber > maxProblemNumber) {
      return null;
    }

    const sourcePath = path.join(docsDir, fileName);
    const targetPath = path.join(publicSolutionsDir, fileName);
    fs.copyFileSync(sourcePath, targetPath);
    return problemNumber;
  })
  .filter((problemNumber) => problemNumber !== null)
  .sort((left, right) => left - right);

const manifestSource = `export const availableSolutionNumbers = ${JSON.stringify(
  copiedSolutionNumbers,
  null,
  2
)} as const;\n`;

fs.writeFileSync(manifestPath, manifestSource);

console.log(
  `Copied ${copiedSolutionNumbers.length} solution files into public/solutions and wrote src/data/solutionManifest.ts`
);
