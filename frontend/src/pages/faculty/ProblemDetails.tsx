import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  Clock3,
  ExternalLink,
  HardDrive,
  Pencil,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { DifficultyBadge, StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { problemsApi } from "@/api/services";
import { toLifecycleLabel } from "@/api/mappers";

export default function ProblemDetails() {
  const { id = "" } = useParams();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-problem-detail", id],
    queryFn: () => problemsApi.getManageDetail(id, "/faculty/problems"),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading problem...</div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">{(error as Error)?.message || "Failed to load problem"}</div>
      </AppLayout>
    );
  }

  const problem = data.problem;

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <Link to="/faculty/problems" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent">
              <ArrowLeft className="h-4 w-4" /> Back to manage problems
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold">{problem.title}</h1>
              <DifficultyBadge d={problem.difficulty} />
              <StatusBadge status={toLifecycleLabel(problem.lifecycleState)} />
            </div>
            <p className="max-w-3xl text-muted-foreground">
              Review the live statement, limits, and testcase coverage before updating the published version.
            </p>
            <div className="flex flex-wrap gap-2">
              {problem.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to={`/student/problems/${problem.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" /> Preview as student
              </Link>
            </Button>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to={`/faculty/problems/${problem.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit Problem
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Submissions", value: problem.totalSubmissions, icon: Sparkles },
            { label: "Acceptance", value: `${problem.acceptanceRate}%`, icon: ShieldCheck },
            { label: "Time Limit", value: `${problem.timeLimitSeconds}s`, icon: Clock3 },
            { label: "Memory Limit", value: `${problem.memoryLimitMb} MB`, icon: HardDrive },
          ].map((item) => (
            <Card key={item.label} className="flex min-h-[120px] flex-col justify-between p-5 shadow-card">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{item.label}</span>
                <item.icon className="h-4 w-4 text-accent" />
              </div>
              <div className="font-display text-3xl font-bold">{item.value}</div>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <Card className="space-y-6 p-6 shadow-card">
            <section>
              <h2 className="mb-2 font-display text-xl font-bold">Problem Statement</h2>
              <p className="leading-7 text-muted-foreground">{problem.statement}</p>
            </section>

            <section className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-display text-lg font-bold">Input Format</h3>
                <p className="leading-7 text-muted-foreground">{problem.inputFormat}</p>
              </div>
              <div>
                <h3 className="mb-2 font-display text-lg font-bold">Output Format</h3>
                <p className="leading-7 text-muted-foreground">{problem.outputFormat}</p>
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-display text-lg font-bold">Constraints</h3>
              <ul className="space-y-2 font-mono-code text-sm text-muted-foreground">
                {problem.constraints.map((constraint) => (
                  <li key={constraint} className="rounded-md bg-secondary/65 px-3 py-2">
                    {constraint}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <BookOpenText className="h-5 w-5 text-accent" />
                <h3 className="font-display text-lg font-bold">Sample Test Cases</h3>
              </div>
              <div className="space-y-3">
                {problem.sampleTestCases.map((example, index) => (
                  <div key={`${example.input}-${index}`} className="rounded-xl border border-border bg-secondary/35 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Case {index + 1}</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Input</div>
                        <div className="rounded-md bg-background px-3 py-2 font-mono-code text-xs">{example.input}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-accent">Output</div>
                        <div className="rounded-md bg-background px-3 py-2 font-mono-code text-xs">{example.output}</div>
                      </div>
                    </div>
                    {example.explanation && <p className="mt-3 text-sm text-muted-foreground">{example.explanation}</p>}
                  </div>
                ))}
              </div>
            </section>
          </Card>

          <div className="space-y-6">
            <Card className="p-6 shadow-card">
              <h2 className="mb-4 font-display text-xl font-bold">Publishing Snapshot</h2>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <span className="text-muted-foreground">Visibility</span>
                  <StatusBadge status={toLifecycleLabel(problem.lifecycleState)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <span className="text-muted-foreground">Last updated</span>
                  <span className="font-mono-code text-xs">{new Date(problem.updatedAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <span className="text-muted-foreground">Topic count</span>
                  <span className="font-semibold">{problem.tags.length}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 shadow-card">
              <h2 className="mb-4 font-display text-xl font-bold">Hidden Coverage</h2>
              <div className="space-y-3">
                {problem.hiddenTestCases.map((example, index) => (
                  <div key={`${example.input}-${index}`} className="rounded-lg border border-border p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hidden Case {index + 1}</div>
                    <div className="space-y-2 font-mono-code text-xs">
                      <div className="rounded-md bg-secondary/65 px-3 py-2">{example.input}</div>
                      <div className="rounded-md bg-secondary/65 px-3 py-2">{example.output}</div>
                    </div>
                  </div>
                ))}
                {problem.hiddenTestCases.length === 0 && <div className="text-sm text-muted-foreground">No hidden test cases yet.</div>}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
