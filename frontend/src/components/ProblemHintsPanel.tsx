import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Lock, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { problemsApi } from "@/api/services";
import { cn } from "@/lib/utils";

/**
 * Progressive hints for a problem.
 *
 * Hints are fetched lazily — the first request is what triggers generation on the server, so
 * mounting this collapsed avoids driving the model for every student who opens a problem and
 * never asks for help.
 */
export function ProblemHintsPanel({ problemId }: { problemId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["student-problem-hints", problemId],
    queryFn: () => problemsApi.getHints(problemId),
    enabled: Boolean(problemId) && open,
  });

  const revealMutation = useMutation({
    mutationFn: () => problemsApi.revealHint(problemId),
    onSuccess: (result) => {
      queryClient.setQueryData(["student-problem-hints", problemId], result);
      setConfirming(false);
    },
    onError: (error: Error) => toast.error(error.message || "Could not reveal the hint"),
  });

  const remaining = data ? data.totalHints - data.revealedCount : 0;

  return (
    <section className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Lightbulb className="h-4 w-4 text-warning" />
          Hints
        </span>
        <span className="text-xs text-muted-foreground">
          {open && data ? `${data.revealedCount}/${data.totalHints} revealed` : "Stuck? Open for a nudge"}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {isLoading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Preparing hints…
            </div>
          )}

          {data && !data.available && (
            <p className="text-xs text-muted-foreground">
              No hints are available for this problem yet.
            </p>
          )}

          {data?.hints.map((hint) => (
            <div
              key={hint.order}
              className={cn(
                "rounded border p-2.5 text-xs",
                hint.revealed ? "border-border" : "border-dashed border-border text-muted-foreground",
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                {!hint.revealed && <Lock className="h-3 w-3" />}
                Hint {hint.order}
              </div>
              {hint.revealed ? <p className="leading-relaxed">{hint.text}</p> : <p>Not revealed yet.</p>}
            </div>
          ))}

          {data?.available && remaining > 0 && (
            <div className="space-y-2">
              {confirming ? (
                <div className="rounded border border-warning/40 bg-warning/10 p-2.5 text-xs">
                  <p className="mb-2">
                    Reveal hint {data.revealedCount + 1} of {data.totalHints}? You have {remaining}{" "}
                    left for this problem.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => revealMutation.mutate()}
                      disabled={revealMutation.isPending}
                    >
                      {revealMutation.isPending ? "Revealing…" : "Reveal"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                  <Lightbulb className="mr-1 h-3.5 w-3.5" />
                  Reveal hint {data.revealedCount + 1}
                </Button>
              )}
            </div>
          )}

          {data?.available && remaining === 0 && (
            <p className="text-xs text-muted-foreground">All hints revealed.</p>
          )}
        </div>
      )}
    </section>
  );
}
