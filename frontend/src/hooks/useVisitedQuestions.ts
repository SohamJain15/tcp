import { useCallback, useEffect, useState } from "react";

/**
 * Tracks which contest questions the student has opened.
 *
 * "Visited" is a navigation fact, not an answer, so it lives in sessionStorage rather than on the
 * attempt: it must survive moving between question pages but has no meaning once the tab closes,
 * and it never needs to reach the server.
 */
function storageKey(contestId: string): string {
  return `tcet:contest:${contestId}:visited`;
}

function readVisited(contestId: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(contestId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function useVisitedQuestions(contestId: string) {
  const [visitedIds, setVisitedIds] = useState<string[]>(() => (contestId ? readVisited(contestId) : []));

  useEffect(() => {
    setVisitedIds(contestId ? readVisited(contestId) : []);
  }, [contestId]);

  const markVisited = useCallback(
    (questionId: string) => {
      if (!contestId || !questionId) {
        return;
      }

      setVisitedIds((current) => {
        if (current.includes(questionId)) {
          return current;
        }

        const next = [...current, questionId];
        try {
          window.sessionStorage.setItem(storageKey(contestId), JSON.stringify(next));
        } catch {
          // Private-mode or quota failure — in-memory tracking still works for this session.
        }
        return next;
      });
    },
    [contestId],
  );

  return { visitedIds, markVisited };
}
