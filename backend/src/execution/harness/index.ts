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
import { ensureHarnessRegistered } from "./register";
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
/**
 * Per-language signal that a submission is a complete program (defines its own
 * entry point / reads stdin) rather than just the Solution skeleton. When true we
 * run it directly instead of injecting the harness. If both a Solution class and
 * an entry point are present, the entry point wins (the student meant to run it).
 */
const ENTRY_POINT_PATTERNS: Partial<Record<ExecutableLanguage, RegExp>> = {
  java: /\bpublic\s+static\s+void\s+main\s*\(/,
  c: /\bint\s+main\s*\(/,
  cpp: /\bint\s+main\s*\(/,
  arduino: /\bint\s+main\s*\(/,
  csharp: /\bstatic\s+(?:async\s+)?(?:void|int|Task)\s+Main\s*\(/,
  python: /if\s+__name__\s*==\s*['"]__main__['"]/,
  javascript: /process\.stdin|readFileSync\s*\(\s*0|require\(\s*['"]readline['"]\s*\)|createInterface/,
  vanilla: /process\.stdin|readFileSync\s*\(\s*0|require\(\s*['"]readline['"]\s*\)|createInterface/,
  typescript: /process\.stdin|readFileSync\s*\(\s*0|require\(\s*['"]readline['"]\s*\)|createInterface/,
  go: /\bfunc\s+main\s*\(/,
  rust: /\bfn\s+main\s*\(/,
  kotlin: /\bfun\s+main\s*\(/,
  ruby: /\bgets\b|\$stdin|STDIN/,
  php: /\bfgets\s*\(|\bSTDIN\b|php:\/\/stdin/,
};

export function submissionUsesOwnProgram(language: ExecutableLanguage, source: string): boolean {
  const pattern = ENTRY_POINT_PATTERNS[language];
  return pattern ? pattern.test(source) : false;
}

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

  // Passthrough: if the student wrote their own full program (has its own entry
  // point) instead of using the Solution skeleton, run it as-is via the legacy
  // wrapper and compare leniently — so a correct solution passes regardless of the
  // exact output formatting, and there's no clash with an injected Main.
  if (submissionUsesOwnProgram(language, userSource)) {
    return { source: wrapSubmissionCode(language, userSource), comparison: { mode: "LENIENT" } };
  }

  // Ensure adapters/serializers are registered even when the caller didn't go
  // through bootstrap (e.g. tests). Idempotent.
  ensureHarnessRegistered();

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
  ensureHarnessRegistered();
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

/**
 * Whether a language can actually run this harness problem — i.e. an adapter exists
 * and can express every declared type (proven by starter generation succeeding).
 * This is the same gate the editor uses to list languages, so submit/run and the
 * editor stay consistent.
 */
export function harnessLanguageSupported(language: ExecutableLanguage, harness: HarnessSpec): boolean {
  if (isLanguageDisabled(harness, language)) {
    return false;
  }
  try {
    return Boolean(generateStarterCode(language, harness));
  } catch {
    return false;
  }
}

export { resolveComparison };
