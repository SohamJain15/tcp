import { toIsoString } from "../../shared/utils/date";
import type { ProblemHint } from "./problem.model";

/**
 * A hint as sent to a student.
 *
 * `text` is present **only** on revealed hints. This is the whole security model for the
 * feature: an unrevealed hint's text never leaves the server, so the lock cannot be defeated by
 * reading the network response, unlike a UI that ships all three and blurs two.
 */
export interface StudentHintView {
  order: number;
  revealed: boolean;
  text: string | null;
}

export interface ProblemHintsResponse {
  totalHints: number;
  revealedCount: number;
  /** False when the problem has no hints yet, so the UI can explain rather than show empty cards. */
  available: boolean;
  hints: StudentHintView[];
}

export function toProblemHintsResponse(
  hints: readonly ProblemHint[],
  revealedCount: number,
): ProblemHintsResponse {
  const safeRevealed = Math.max(0, Math.min(revealedCount, hints.length));

  return {
    totalHints: hints.length,
    revealedCount: safeRevealed,
    available: hints.length > 0,
    hints: hints.map((hint, index) => {
      const revealed = index < safeRevealed;
      return {
        order: hint.order,
        revealed,
        text: revealed ? hint.text : null,
      };
    }),
  };
}

/** Faculty view: full text plus provenance, so hints can be reviewed before students see them. */
export interface FacultyHintView {
  order: number;
  text: string;
  generatedAt: string | null;
  model: string | null;
  promptVersion: string | null;
  editedBy: string | null;
}

export function toFacultyHintViews(hints: readonly ProblemHint[]): FacultyHintView[] {
  return hints.map((hint) => ({
    order: hint.order,
    text: hint.text,
    generatedAt: toIsoString(hint.generatedAt),
    model: hint.model,
    promptVersion: hint.promptVersion,
    editedBy: hint.editedBy,
  }));
}

export function buildGeneratedHints(
  texts: readonly string[],
  model: string,
  promptVersion: string,
  now: Date,
): ProblemHint[] {
  return texts.map((text, index) => ({
    order: index + 1,
    text,
    generatedAt: now,
    model,
    promptVersion,
    editedBy: null,
  }));
}
