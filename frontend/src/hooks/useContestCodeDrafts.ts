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

/** The language a question was last worked in, so reopening it does not reset to the default. */
function languageKey(contestId: string, questionId: string): string {
  return `tcet:contest:${contestId}:lang:${questionId}`;
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

  const getLanguage = useCallback(
    (questionId: string): string | null => {
      if (!contestId || !questionId) {
        return null;
      }
      try {
        return window.sessionStorage.getItem(languageKey(contestId, questionId));
      } catch {
        return null;
      }
    },
    [contestId],
  );

  const setLanguage = useCallback(
    (questionId: string, language: string) => {
      if (!contestId || !questionId) {
        return;
      }
      try {
        window.sessionStorage.setItem(languageKey(contestId, questionId), language);
      } catch {
        // Non-fatal — the editor still works, it just reopens in the default language.
      }
    },
    [contestId],
  );

  return { getDraft, setDraft, getLanguage, setLanguage };
}
