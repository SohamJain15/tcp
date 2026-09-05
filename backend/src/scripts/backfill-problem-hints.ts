import { OllamaHintGenerator } from "../modules/problem/ai/hint-generator";
import { FirestoreProblemRepository } from "../modules/problem/problem.repository";
import { generateAndStoreHints, type ProblemServiceDependencies } from "../modules/problem/problem.service";

/**
 * Generates AI hints for problems that do not have them yet.
 *
 * Hints are generated lazily on a student's first request, so strictly speaking nothing has to be
 * run — the platform heals itself one problem at a time. What it costs without this script is
 * that the *first* student to open the hints panel on each problem waits out a full model call,
 * and gets nothing at all if the model happens to be down at that moment. Running this once after
 * deploy moves that cost off the students.
 *
 * Idempotent: a problem that already has hints is skipped, so re-running only fills gaps. Pass
 * `--force` to regenerate every published problem, which **discards any hints faculty have
 * edited by hand** — that is why it is not the default.
 *
 *   npm run backfill:hints
 *   npm run backfill:hints -- --force
 */
async function backfillProblemHints(): Promise<void> {
  const force = process.argv.includes("--force");
  const problemRepository = new FirestoreProblemRepository();
  const hintGenerator = new OllamaHintGenerator();

  // Probe once up front. Without this a missing model produces one failure per problem, burying
  // the actual missing-model cause under a hundred identical lines.
  const status = await hintGenerator.getStatus();
  if (!status.available) {
    console.error(`Cannot generate hints: ${status.reason}`);
    console.error(`  model:   ${status.model}`);
    console.error(`  baseUrl: ${status.baseUrl}`);
    process.exit(1);
  }

  console.log(`Using model ${status.model} at ${status.baseUrl}.`);

  // Only the four fields `generateAndStoreHints` actually touches; the rest of the problem
  // service's dependencies are irrelevant here and are left unset on purpose.
  const dependencies = {
    problemRepository,
    hintGenerator,
    now: () => new Date(),
  } as unknown as ProblemServiceDependencies;

  // Drafts and archived problems are unreachable by students, so generating for them would spend
  // model time on hints nobody can open.
  const problems = (await problemRepository.list()).filter(
    (problem) => problem.lifecycleState === "Published",
  );
  const pending = force ? problems : problems.filter((problem) => problem.hints.length === 0);

  if (force) {
    console.warn("--force: regenerating every published problem, including hand-edited hints.");
  }

  console.log(
    `${problems.length} published problem(s); ${pending.length} need hints. This calls the model once per problem and is slow.`,
  );

  let generated = 0;
  const failures: string[] = [];

  // Sequential on purpose: a local Ollama serves one request at a time, so firing these in
  // parallel only makes each slower while risking a queue timeout.
  for (const [index, problem] of pending.entries()) {
    try {
      const hints = await generateAndStoreHints(dependencies, problem, { force });
      if (hints.length > 0) {
        generated += 1;
        console.log(`  [${index + 1}/${pending.length}] ${problem.title}`);
      } else {
        // The model replied, but not with three usable hints. Storing nothing beats storing a
        // partial or code-carrying hint, so this is a skip rather than a hard error.
        failures.push(`${problem.id} (${problem.title}): model returned no usable hints`);
      }
    } catch (error) {
      // One bad problem must not abort the whole run.
      failures.push(
        `${problem.id} (${problem.title}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`Done. Generated hints for ${generated} problem(s).`);
  if (failures.length > 0) {
    console.warn(`${failures.length} problem(s) produced no hints:`);
    failures.forEach((failure) => console.warn(`  ${failure}`));
    console.warn("Re-running is safe and will retry only these.");
  }
}

backfillProblemHints()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Hint backfill failed:", error);
    process.exit(1);
  });
