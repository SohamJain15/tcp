import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, CheckCircle2, ChevronDown, Circle, CircleDot, ListFilter, Search } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { DifficultyBadge } from "@/components/Badges";
import { cn } from "@/lib/utils";
import { problemsApi } from "@/api/services";
import type { Difficulty, StudentProblemStatus, StudentProblemSummary } from "@/api/types";

const BOOKMARKS_STORAGE_KEY = "problem_bookmarks";
const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
const STATUS_OPTIONS: Array<{ value: StudentProblemStatus | "All"; label: string }> = [
  { value: "All", label: "All" },
  { value: "solved", label: "Solved" },
  { value: "attempted", label: "Attempted" },
  { value: "todo", label: "Unsolved" },
];

function loadBookmarks(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Set<string>>(loadBookmarks);

  const toggleBookmark = useCallback((problemId: string) => {
    setBookmarks((current) => {
      const next = new Set(current);
      if (next.has(problemId)) {
        next.delete(problemId);
      } else {
        next.add(problemId);
      }

      try {
        window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Ignore storage failures; bookmarks stay in-memory for the session.
      }

      return next;
    });
  }, []);

  return { bookmarks, toggleBookmark };
}

function StatusIcon({ status }: { status: StudentProblemStatus }) {
  if (status === "solved") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  }

  if (status === "attempted") {
    return <CircleDot className="h-4 w-4 shrink-0 text-warning" />;
  }

  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

const MAX_VISIBLE_TAGS = 3;

const ProblemRow = memo(function ProblemRow({
  problem,
  isBookmarked,
  onToggleBookmark,
}: {
  problem: StudentProblemSummary;
  isBookmarked: boolean;
  onToggleBookmark: (problemId: string) => void;
}) {
  const visibleTags = problem.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = problem.tags.length - visibleTags.length;

  return (
    <Link to={`/student/problems/${problem.id}`} className="block">
      <Card className="card-interactive p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5">
              <StatusIcon status={problem.userStatus} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-medium">{problem.title}</h3>
                <DifficultyBadge d={problem.difficulty} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {visibleTags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
                {hiddenTagCount > 0 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    +{hiddenTagCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
            <div className="text-right">
              <div className="font-mono-code text-sm font-semibold">{problem.acceptanceRate}%</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Acceptance</div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark problem"}
              aria-pressed={isBookmarked}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleBookmark(problem.id);
              }}
            >
              <Bookmark className={cn("h-4 w-4", isBookmarked ? "fill-accent text-accent" : "text-muted-foreground")} />
            </Button>
            <Button variant="outline" size="sm" className="hidden md:inline-flex" tabIndex={-1}>
              Solve Challenge
            </Button>
          </div>
        </div>
      </Card>
    </Link>
  );
});

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

interface FilterPanelProps {
  status: StudentProblemStatus | "All";
  onStatusChange: (status: StudentProblemStatus | "All") => void;
  difficulties: Set<Difficulty>;
  onToggleDifficulty: (difficulty: Difficulty) => void;
  tags: Set<string>;
  onToggleTag: (tag: string) => void;
  allTags: string[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

const FilterPanel = memo(function FilterPanel({
  status,
  onStatusChange,
  difficulties,
  onToggleDifficulty,
  tags,
  onToggleTag,
  allTags,
  hasActiveFilters,
  onClearFilters,
}: FilterPanelProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Filters</h2>
        {hasActiveFilters && (
          <button type="button" onClick={onClearFilters} className="text-xs font-medium text-accent hover:underline">
            Clear all
          </button>
        )}
      </div>

      <Separator className="my-4" />

      <FilterSection title="Status">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onStatusChange(option.value)}
            className={cn(
              "flex w-full items-center gap-2 text-left text-sm transition-colors",
              status === option.value ? "font-semibold text-accent" : "text-foreground/80 hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-3.5 w-3.5 items-center justify-center border",
                status === option.value ? "border-accent" : "border-muted-foreground/50",
              )}
              aria-hidden
            >
              {status === option.value && <span className="h-1.5 w-1.5 bg-accent" />}
            </span>
            {option.label}
          </button>
        ))}
      </FilterSection>

      <Separator className="my-4" />

      <FilterSection title="Difficulty">
        {DIFFICULTIES.map((difficulty) => (
          <label key={difficulty} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={difficulties.has(difficulty)}
              onCheckedChange={() => onToggleDifficulty(difficulty)}
              aria-label={difficulty}
            />
            {difficulty}
          </label>
        ))}
      </FilterSection>

      <Separator className="my-4" />

      <FilterSection title="Skills / Tags">
        {allTags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tags available.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-2">
            {allTags.map((tag) => (
              <label key={tag} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={tags.has(tag)} onCheckedChange={() => onToggleTag(tag)} aria-label={tag} />
                <span className="truncate">{tag}</span>
              </label>
            ))}
          </div>
        )}
      </FilterSection>
    </Card>
  );
});

export default function StudentProblems() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StudentProblemStatus | "All">("All");
  const [difficulties, setDifficulties] = useState<Set<Difficulty>>(new Set());
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const deferredQuery = useDeferredValue(q);
  const { bookmarks, toggleBookmark } = useBookmarks();

  // Single fetch — every filter (search included) is applied client-side, so no
  // network chatter or refetch-triggered rerenders while the user types.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-problems"],
    queryFn: () => problemsApi.listStudent({ pageSize: 100 }),
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const allTags = useMemo(() => Array.from(new Set(items.flatMap((problem) => problem.tags))).sort(), [items]);

  const filtered = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    return items.filter((problem) => {
      if (status !== "All" && problem.userStatus !== status) {
        return false;
      }

      if (difficulties.size > 0 && !difficulties.has(problem.difficulty)) {
        return false;
      }

      if (tags.size > 0 && !problem.tags.some((tag) => tags.has(tag))) {
        return false;
      }

      if (query && !problem.title.toLowerCase().includes(query)) {
        return false;
      }

      return true;
    });
  }, [items, status, difficulties, tags, deferredQuery]);

  const toggleDifficulty = useCallback((difficulty: Difficulty) => {
    setDifficulties((current) => {
      const next = new Set(current);
      if (next.has(difficulty)) {
        next.delete(difficulty);
      } else {
        next.add(difficulty);
      }
      return next;
    });
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const hasActiveFilters = status !== "All" || difficulties.size > 0 || tags.size > 0;

  const clearFilters = useCallback(() => {
    setStatus("All");
    setDifficulties(new Set());
    setTags(new Set());
  }, []);

  const filterPanel = (
    <FilterPanel
      status={status}
      onStatusChange={setStatus}
      difficulties={difficulties}
      onToggleDifficulty={toggleDifficulty}
      tags={tags}
      onToggleTag={toggleTag}
      allTags={allTags}
      hasActiveFilters={hasActiveFilters}
      onClearFilters={clearFilters}
    />
  );

  return (
    <AppLayout>
      <div className="container space-y-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-3xl font-bold">Problem Set</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sharpen your skills, one problem at a time.</p>
          </div>
          {!isLoading && !isError && (
            <p className="text-sm text-muted-foreground">
              {filtered.length} of {items.length} problems
            </p>
          )}
        </div>

        {/* Mobile filters */}
        <Collapsible open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen} className="lg:hidden">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <ListFilter className="h-4 w-4" /> Filters
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", mobileFiltersOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">{filterPanel}</CollapsibleContent>
        </Collapsible>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),280px]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search problems..."
                className="pl-9"
              />
            </div>

            {isLoading && (
              <Card className="p-10 text-center text-sm text-muted-foreground">Loading problems...</Card>
            )}
            {isError && (
              <Card className="p-10 text-center text-sm text-destructive">
                {(error as Error)?.message || "Failed to load problems"}
              </Card>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">No problems match your filters.</Card>
            )}
            {!isLoading && !isError && (
              <div className="space-y-2">
                {filtered.map((problem) => (
                  <ProblemRow
                    key={problem.id}
                    problem={problem}
                    isBookmarked={bookmarks.has(problem.id)}
                    onToggleBookmark={toggleBookmark}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sticky filter sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">{filterPanel}</div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
