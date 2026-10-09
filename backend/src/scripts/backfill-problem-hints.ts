import { GatewayHintGenerator } from "../modules/problem/ai/hint-generator";
import type { ProblemRecord } from "../modules/problem/problem.model";
import { FirestoreProblemRepository } from "../modules/problem/problem.repository";
import { generateAndStoreHints, type ProblemServiceDependencies } from "../modules/problem/problem.service";

/**
 * Generates AI hints for published problems that do not have them yet.
 *
 * New problems get hints automatically when published, and any problem still missing them is
 * generated lazily on a student's first request. This script fills the gaps left when the AI
 * gateway was unreachable (e.g. problems published during an outage), so no student has to wait
 * out a model call or find the hints panel empty.
 *
 * Idempotent: a problem that already has hints is skipped, so re-running only fills gaps. Pass
 * `--force` to regenerate every published problem, which **discards any hints faculty have
 * edited by hand** — that is why it is not the default. Pass `--problem <id>` to target one
 * problem (regenerated even if it has hints only when combined with `--force`).
 *
 *   npm run backfill:hints
 *   npm run backfill:hints -- --problem problem_123
 *   npm run backfill:hints -- --force
 */

const RETRY_DELAY_MS = 15_000;

function readProblemArg(): string | null {
  const index = process.argv.indexOf("--problem");
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error("--problem needs a problem id, e.g. --problem problem_123");
    process.exit(1);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillProblemHints(): Promise<void> {
  const force = process.argv.includes("--force");
  const onlyProblemId = readProblemArg();
  const problemRepository = new FirestoreProblemRepository();
  const hintGenerator = new GatewayHintGenerator();

  // Probe once up front. Without this a bad key or a down gateway produces one failure per
  // problem, burying the actual cause under a hundred identical lines.
  const status = await hintGenerator.getStatus();
  if (!status.available) {
    console.error(`Cannot generate hints: ${status.reason}`);
    console.error(`  gateway: ${status.baseUrl}`);
    console.error("  Check AI_ENABLED, AI_BASE_URL and AI_API_KEY in backend/.env.");
    process.exit(1);
  }

  console.log(`Using AI gateway at ${status.baseUrl} (model ${status.model}).`);

  // Only the fields `generateAndStoreHints` actually touches; the rest of the problem service's
  // dependencies are irrelevant here and are left unset on purpose.
  const dependencies = {
    problemRepository,
    hintGenerator,
    now: () => new Date(),
  } as unknown as ProblemServiceDependencies;

  let problems: ProblemRecord[];
  if (onlyProblemId) {
    const problem = await problemRepository.getById(onlyProblemId);
    if (!problem) {
      console.error(`Problem ${onlyProblemId} not found.`);
      process.exit(1);
    }
    problems = [problem];
  } else {
    // Drafts and archived problems are unreachable by students, so generating for them would
    // spend model time on hints nobody can open.
    problems = (await problemRepository.list()).filter((problem) => problem.lifecycleState === "Published");
  }
  const pending = force ? problems : problems.filter((problem) => problem.hints.length === 0);

  if (force) {
    console.warn("--force: regenerating hints, including any edited by hand.");
  }

  console.log(
    `${problems.length} problem(s) considered; ${pending.length} need hints. This calls the model once per problem and is slow.`,
  );

  let generated = 0;
  const failures: string[] = [];

  // Sequential on purpose: the gateway is one shared campus server, so firing these in parallel
  // only makes each slower while risking timeouts for everyone else using it.
  for (const [index, problem] of pending.entries()) {
    const label = `[${index + 1}/${pending.length}] ${problem.title}`;
    try {
      let hints = await generateAndStoreHints(dependencies, problem, { force });
      if (hints.length === 0) {
        // Usually a busy gateway (502/timeout). One retry after a pause clears most of these.
        await sleep(RETRY_DELAY_MS);
        const fresh = (await problemRepository.getById(problem.id)) ?? problem;
        hints = await generateAndStoreHints(dependencies, fresh, { force });
      }

      if (hints.length > 0) {
        generated += 1;
        console.log(`  ${label}`);
      } else {
        // The model replied, but not with three usable hints, or another process holds the lock.
        // Storing nothing beats storing a partial or code-carrying hint.
        failures.push(`${problem.id} (${problem.title}): no usable hints (gateway busy, invalid reply, or locked)`);
        console.warn(`  ${label} — skipped`);
      }
    } catch (error) {
      // One bad problem must not abort the whole run.
      failures.push(`${problem.id} (${problem.title}): ${error instanceof Error ? error.message : String(error)}`);
      console.warn(`  ${label} — failed`);
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
