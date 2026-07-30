import type { ExecutableLanguage } from "../../shared/types/domain";
import { wrapSubmissionCode } from "../code-wrapper";
import type { GeneratedHarness } from "./adapters/language-adapter";
import type { ComparisonContext } from "./comparator/comparator";
import {
  DEFAULT_COMPARISON,
  isLanguageDisabled,
  resolveComparison,
  type ComparisonMode,
  type HarnessSpec,
} from "./contract";
import { HarnessGenerationError } from "./errors";
import { harnessRegistry } from "./registry";

export type { HarnessSpec } from "./contract";
export { HARNESS_SCHEMA_VERSION } from "./contract";
export { harnessRegistry, HarnessRegistry } from "./registry";
export { HarnessError, HarnessGenerationError, UnsupportedTypeError } from "./errors";

/**
 * Produce the full program to execute for a submission.
 *
 * - No `harness` metadata => legacy raw-stdin behaviour (verbatim {@link wrapSubmissionCode}),
 *   with EXACT comparison so Judge0 keeps comparing as it does today.
 * - With `harness` metadata => the language adapter generates a typed wrapper and
 *   declares how its output should be compared.
 */
export function generateSubmissionProgram(
  language: ExecutableLanguage,
  userSource: string,
  harness?: HarnessSpec,
): GeneratedHarness {
  if (!harness) {
    return { source: wrapSubmissionCode(language, userSource), comparison: DEFAULT_COMPARISON };
  }

  if (isLanguageDisabled(harness, language)) {
    throw new HarnessGenerationError(`Language "${language}" is disabled for this problem`, language);
  }

  const adapter = harnessRegistry.getAdapter(language);
  if (!adapter) {
    throw new HarnessGenerationError(`No harness adapter registered for language "${language}"`, language);
  }

  const sink = { runtime: new Map<string, string>(), counter: { value: 0 } };
  const ctx = harnessRegistry.createContext(harness, language, sink);
  return adapter.generate({ spec: harness, userSource, language }, ctx);
}

/** Generate empty starter code for a problem in a language, or undefined if no adapter. */
export function generateStarterCode(
  language: ExecutableLanguage,
  harness: HarnessSpec,
): string | undefined {
  const override = harness.languageOverrides?.[language]?.starter;
  if (override) {
    return override;
  }
  return harnessRegistry.getAdapter(language)?.generateStarter(harness);
}

/**
 * Run the local comparator for a resolved comparison mode. `EXACT` is normally
 * delegated to Judge0 and does not reach here, but is supported for completeness
 * and for the stub provider.
 */
export function compareOutput(
  comparison: ComparisonMode,
  expected: string,
  actual: string,
  input?: string,
): boolean {
  const ctx: ComparisonContext = { mode: comparison, input };
  return harnessRegistry.getComparator(comparison.mode).compare(expected, actual, ctx);
}

/** Whether the provider should delegate comparison to Judge0 (EXACT) or compare locally. */
export function isDelegatedComparison(comparison: ComparisonMode): boolean {
  return comparison.mode === "EXACT";
}

export { resolveComparison };
