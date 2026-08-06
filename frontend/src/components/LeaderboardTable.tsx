import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Award, Medal, Trophy } from "lucide-react";

import { Card } from "@/components/ui/card";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import {
  buildYearRanks,
  formatLeaderboardDuration,
  getYearLabel,
  type LeaderboardMode,
  type LeaderboardRow,
} from "@/lib/leaderboard-rows";
import { cn } from "@/lib/utils";

const podiumIcons = [Trophy, Medal, Award];
const podiumGradients = [
  "from-gold to-accent",
  "from-muted-foreground to-muted-foreground/60",
  "from-accent/80 to-accent/40",
];

interface LeaderboardTableProps {
  rows: LeaderboardRow[];
  mode: LeaderboardMode;
  /** Faculty only — links each student through to their profile. */
  linkToProfile?: boolean;
  emptyMessage?: string;
  /** Email of the signed-in student, whose row is highlighted (and pinned if beyond the cap). */
  currentEmail?: string | null;
  /** Cap the number of ranked rows shown; the current user is appended below the cap if outside it. */
  maxVisible?: number;
  /**
   * The current user's row when it is not in `rows` at all.
   *
   * The server sends only the first page of the board, so a student ranked #255 is absent from the
   * payload entirely — `rows` cannot be searched for them. The API returns their entry separately and
   * it arrives here.
   */
  fallbackCurrentRow?: LeaderboardRow | null;
}

/**
 * Podium plus ranked table for both leaderboards. Columns follow the mode: problem ratings show
 * accuracy, contest standings show the time and violations that actually decide contest rank.
 */
/**
 * Efficiency is a 0-1 percentile against the ranked field, shown as a percentage. A dash means
 * there was no code to measure — an MCQ-only contest, or a student with no accepted solutions.
 */
function formatEfficiency(score: number | null): string {
  return score === null ? "-" : `${Math.round(score * 100)}%`;
}

/** Program runtime stays in milliseconds — it is not person-time, so no duration formatting. */
function formatRuntime(runtimeMs: number | null): string {
  return runtimeMs === null || runtimeMs === 0 ? "-" : `${runtimeMs} ms`;
}

export function LeaderboardTable({
  rows,
  mode,
  linkToProfile = false,
  emptyMessage = "No leaderboard data yet.",
  currentEmail = null,
  maxVisible,
  fallbackCurrentRow = null,
}: LeaderboardTableProps) {
  const isContest = mode === "contest";
  // Only the top `maxVisible` entries are shown at once; the podium (top 3) counts toward that cap.
  const visibleRows = maxVisible ? rows.slice(0, maxVisible) : rows;
  const top3 = visibleRows.slice(0, 3);
  const rest = visibleRows.slice(3);
  const yearRanks = buildYearRanks(rows);
  const isCurrent = (row: LeaderboardRow) => Boolean(currentEmail) && row.email === currentEmail;
  // The signed-in student's row, pinned to the bottom when their rank falls outside the visible cap
  // — or outside the fetched page entirely, in which case the server supplies it separately.
  const currentRow = currentEmail
    ? rows.find((row) => row.email === currentEmail) ?? fallbackCurrentRow
    : null;
  const currentPinned = Boolean(
    currentRow && !visibleRows.some((row) => row.key === currentRow.key),
  );
  // Rank + Student + Solved + Score, plus Year/Time/Efficiency/Runtime/Violations (contest) or
  // Efficiency/Accuracy (problem).
  const columnCount = isContest ? 9 : 6;

  const withProfileLink = (row: LeaderboardRow, children: ReactNode, className?: string) =>
    linkToProfile ? (
      <Link to={toFacultyStudentProfilePath(row.email)} className={className}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    );

  const renderRow = (row: LeaderboardRow) => (
    <tr
      key={row.key}
      className={cn(
        "border-t border-border hover:bg-secondary/50",
        isContest && row.year && (yearRanks.get(row.key) ?? 0) <= 2 && "bg-accent/10",
        isCurrent(row) && "bg-accent/20 hover:bg-accent/20 ring-1 ring-inset ring-accent/60",
      )}
    >
      <td className="px-4 py-3 font-display font-bold">
        #{row.rank}
        {isCurrent(row) && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-accent">You</span>}
      </td>
      <td className="px-4 py-3">
        {withProfileLink(
          row,
          <>
            <div className="font-medium">{row.name ?? row.email}</div>
            <div className="font-mono-code text-xs text-muted-foreground">{row.uid ?? row.email}</div>
          </>,
          linkToProfile ? "block hover:text-accent" : undefined,
        )}
      </td>
      {isContest && <td className="hidden px-4 py-3 md:table-cell">{row.year ? getYearLabel(row.year) : "-"}</td>}
      <td className="hidden px-2 py-3 text-right font-mono-code sm:table-cell sm:px-4">
        {row.total !== null ? `${row.solved}/${row.total}` : row.solved}
      </td>
      <td className="px-4 py-3 text-right font-mono-code font-semibold">{row.score}</td>
      {isContest ? (
        <>
          <td className="hidden px-2 py-3 text-right font-mono-code sm:table-cell sm:px-4">{formatLeaderboardDuration(row.timeTakenMs)}</td>
          <td className="hidden px-4 py-3 text-right font-mono-code lg:table-cell">{formatEfficiency(row.optimizationScore)}</td>
          <td className="hidden px-4 py-3 text-right font-mono-code lg:table-cell">{formatRuntime(row.runtimeMs)}</td>
          <td
            className={cn(
              "hidden px-4 py-3 text-right font-mono-code md:table-cell",
              (row.violationCount ?? 0) > 0 && "text-destructive",
            )}
          >
            {row.violationCount ?? 0}
          </td>
        </>
      ) : (
        <>
          <td
            className="hidden px-4 py-3 text-right font-mono-code lg:table-cell"
            title={
              row.primaryLanguage
                ? `Compared against other ${row.primaryLanguage} submissions`
                : undefined
            }
          >
            {formatEfficiency(row.optimizationScore)}
          </td>
          <td className="hidden px-2 py-3 text-right font-mono-code sm:table-cell sm:px-4">{row.accuracy ?? 0}%</td>
        </>
      )}
    </tr>
  );

  return (
    <>
      {top3.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {top3.map((row, index) => {
            const Icon = podiumIcons[index];

            return (
              <div key={row.key} className={cn(index === 0 && "md:scale-105")}>
                {withProfileLink(
                  row,
                  <Card
                    className={cn(
                      "relative h-full overflow-hidden p-6 shadow-elevated",
                      linkToProfile && "card-interactive",
                      isCurrent(row) && "ring-2 ring-accent",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-20",
                        podiumGradients[index],
                      )}
                    />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <Icon
                          className={cn(
                            "h-8 w-8",
                            index === 0 ? "text-gold" : index === 1 ? "text-muted-foreground" : "text-accent",
                          )}
                        />
                        <span className="font-display text-4xl font-bold text-muted-foreground/30">
                          #{row.rank}
                        </span>
                      </div>
                      <h3 className="mt-3 font-display text-xl font-bold">{row.name ?? row.email}</h3>
                      <p className="font-mono-code text-xs text-muted-foreground">{row.uid ?? row.email}</p>
                      {row.year && (
                        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                          {getYearLabel(row.year)} Leader
                        </p>
                      )}
                      {/* Four stats on the podium: efficiency now decides rank above accuracy,
                          so the top three must show it too — the rows below already do. */}
                      <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <PodiumStat
                          label="Solved"
                          value={row.total !== null ? `${row.solved}/${row.total}` : String(row.solved)}
                        />
                        <PodiumStat label="Score" value={String(row.score)} />
                        <PodiumStat label="Efficiency" value={formatEfficiency(row.optimizationScore)} />
                        {isContest ? (
                          <PodiumStat label="Time" value={formatLeaderboardDuration(row.timeTakenMs)} />
                        ) : (
                          <PodiumStat label="Accuracy" value={`${row.accuracy ?? 0}%`} />
                        )}
                      </div>
                    </div>
                  </Card>,
                  "block h-full",
                )}
              </div>
            );
          })}
        </div>
      )}

      <Card className="overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr className="text-left">
                <th className="w-16 px-4 py-3 font-semibold">Rank</th>
                <th className="px-4 py-3 font-semibold">Student</th>
                {isContest && <th className="hidden px-4 py-3 font-semibold md:table-cell">Year</th>}
                <th className="hidden px-2 py-3 text-right font-semibold sm:table-cell sm:px-4">Solved</th>
                <th className="px-4 py-3 text-right font-semibold">Score</th>
                {isContest ? (
                  <>
                    <th className="hidden px-2 py-3 text-right font-semibold sm:table-cell sm:px-4">Time</th>
                    <th className="hidden px-4 py-3 text-right font-semibold lg:table-cell">Efficiency</th>
                    <th className="hidden px-4 py-3 text-right font-semibold lg:table-cell">Runtime</th>
                    <th className="hidden px-4 py-3 text-right font-semibold md:table-cell">Violations</th>
                  </>
                ) : (
                  <>
                    {/* Efficiency outranks accuracy in the ordering, so it is shown first. */}
                    <th className="hidden px-4 py-3 text-right font-semibold lg:table-cell">Efficiency</th>
                    <th className="hidden px-2 py-3 text-right font-semibold sm:table-cell sm:px-4">Accuracy</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rest.map(renderRow)}
              {currentPinned && currentRow && (
                <>
                  <tr aria-hidden>
                    <td colSpan={columnCount} className="border-t border-border bg-secondary/40 px-4 py-1.5 text-center text-xs text-muted-foreground">
                      • • •
                    </td>
                  </tr>
                  {renderRow(currentRow)}
                </>
              )}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-12 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function PodiumStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
