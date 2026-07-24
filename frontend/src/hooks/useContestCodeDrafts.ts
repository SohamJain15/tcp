import { useCallback } from "react";

/**
 * Per-question, per-language code persistence for a contest attempt.
 *
 * Each coding question keeps its own editor content — code typed in Q1 must never appear in Q2 — and
 * that content must survive navigating between questions and a page refresh. sessionStorage keyed by
 * contest + question + language satisfies both, and clears itself when the tab closes.
 */
function draftKey(contestId: string, questionId: string, language: string): string {
  return `tcet:contest:${contestId}:code:${questionId}:${language}`;
}

export function useContestCodeDrafts(contestId: string) {
  const getDraft = useCallback(
    (questionId: string, language: string): string | null => {
      if (!contestId || !questionId) {
        return null;
      }
      try {
        return window.sessionStorage.getItem(draftKey(contestId, questionId, language));
      } catch {
        return null;
      }
    },
    [contestId],
  );

  const setDraft = useCallback(
    (questionId: string, language: string, code: string) => {
      if (!contestId || !questionId) {
        return;
      }
      try {
        window.sessionStorage.setItem(draftKey(contestId, questionId, language), code);
      } catch {
        // Private mode or quota exhausted — the in-memory editor value still works this session.
      }
    },
    [contestId],
  );

  return { getDraft, setDraft };
}
