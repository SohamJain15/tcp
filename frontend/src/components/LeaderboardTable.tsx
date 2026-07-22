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
}

/**
 * Podium plus ranked table for both leaderboards. Columns follow the mode: problem ratings show
 * accuracy, contest standings show the time and violations that actually decide contest rank.
 */
export function LeaderboardTable({
  rows,
  mode,
  linkToProfile = false,
  emptyMessage = "No leaderboard data yet.",
}: LeaderboardTableProps) {
  const isContest = mode === "contest";
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const yearRanks = buildYearRanks(rows);
  // Rank + Student + Solved + Score, plus Year/Time/Violations (contest) or Accuracy (problem).
  const columnCount = isContest ? 7 : 5;

  const withProfileLink = (row: LeaderboardRow, children: ReactNode, className?: string) =>
    linkToProfile ? (
      <Link to={toFacultyStudentProfilePath(row.email)} className={className}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
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
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <PodiumStat label="Solved" value={String(row.solved)} />
                        <PodiumStat label="Score" value={String(row.score)} />
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
                {isContest && <th className="px-4 py-3 font-semibold">Year</th>}
                <th className="px-4 py-3 text-right font-semibold">Solved</th>
                <th className="px-4 py-3 text-right font-semibold">Score</th>
                {isContest ? (
                  <>
                    <th className="px-4 py-3 text-right font-semibold">Time</th>
                    <th className="px-4 py-3 text-right font-semibold">Violations</th>
                  </>
                ) : (
                  <th className="px-4 py-3 text-right font-semibold">Accuracy</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rest.map((row) => (
                <tr
                  key={row.key}
                  className={cn(
                    "border-t border-border hover:bg-secondary/50",
                    isContest && row.year && (yearRanks.get(row.key) ?? 0) <= 2 && "bg-accent/10",
                  )}
                >
                  <td className="px-4 py-3 font-display font-bold">#{row.rank}</td>
                  <td className="px-4 py-3">
                    {withProfileLink(
                      row,
                      <>
                        <div className="font-medium">{row.name ?? row.email}</div>
                        <div className="font-mono-code text-xs text-muted-foreground">
                          {row.uid ?? row.email}
                        </div>
                      </>,
                      linkToProfile ? "block hover:text-accent" : undefined,
                    )}
                  </td>
                  {isContest && (
                    <td className="px-4 py-3">{row.year ? getYearLabel(row.year) : "-"}</td>
                  )}
                  <td className="px-4 py-3 text-right font-mono-code">{row.solved}</td>
                  <td className="px-4 py-3 text-right font-mono-code font-semibold">{row.score}</td>
                  {isContest ? (
                    <>
                      <td className="px-4 py-3 text-right font-mono-code">
                        {formatLeaderboardDuration(row.timeTakenMs)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-mono-code",
                          (row.violationCount ?? 0) > 0 && "text-destructive",
                        )}
                      >
                        {row.violationCount ?? 0}
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-3 text-right font-mono-code">{row.accuracy ?? 0}%</td>
                  )}
                </tr>
              ))}
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
