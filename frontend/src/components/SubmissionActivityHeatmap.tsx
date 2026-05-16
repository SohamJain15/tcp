import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

type ActivityPoint = {
  createdAt: string;
};

type HeatmapEntry = {
  date: string;
  submissionCount: number;
};

type SubmissionActivityHeatmapProps = {
  submissions?: ActivityPoint[];
  activity?: HeatmapEntry[];
};

type DayCell = {
  date: Date;
  count: number;
  inRange: boolean;
};

function toDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function chunkIntoWeeks(days: DayCell[]): DayCell[][] {
  const weeks: DayCell[][] = [];

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

function getIntensityClass(count: number, inRange: boolean): string {
  if (!inRange) {
    return "bg-transparent";
  }

  if (count === 0) {
    return "bg-secondary";
  }

  if (count < 3) {
    return "bg-primary/35";
  }

  if (count < 6) {
    return "bg-primary/60";
  }

  return "bg-primary";
}

function computeMaxStreak(cells: DayCell[]): number {
  let maxStreak = 0;
  let currentStreak = 0;

  for (const cell of cells) {
    if (!cell.inRange) {
      continue;
    }

    if (cell.count > 0) {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return maxStreak;
}

export function SubmissionActivityHeatmap({ submissions = [], activity }: SubmissionActivityHeatmapProps) {
  const today = startOfDay(new Date());
  const rangeStart = subDays(today, 364);
  const gridStart = startOfWeek(rangeStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(today, { weekStartsOn: 0 });

  const counts = new Map<string, number>();
  if (activity && activity.length > 0) {
    activity.forEach((entry) => {
      const createdAt = startOfDay(new Date(entry.date));
      if (isBefore(createdAt, rangeStart) || isAfter(createdAt, today)) {
        return;
      }

      counts.set(toDayKey(createdAt), entry.submissionCount);
    });
  } else {
    submissions.forEach((submission) => {
      const createdAt = startOfDay(new Date(submission.createdAt));
      if (isBefore(createdAt, rangeStart) || isAfter(createdAt, today)) {
        return;
      }

      const key = toDayKey(createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  }

  const cells = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => ({
    date,
    count: counts.get(toDayKey(date)) ?? 0,
    inRange: !isBefore(date, rangeStart) && !isAfter(date, today),
  }));

  const weeks = chunkIntoWeeks(cells);
  const monthLabels: Array<{ key: string; label: string }> = [];
  let currentMonth = startOfMonth(rangeStart);

  while (!isAfter(currentMonth, today)) {
    const monthEnd = endOfMonth(currentMonth);
    const labelDate = startOfWeek(currentMonth, { weekStartsOn: 0 });
    if (!isBefore(labelDate, gridStart) && !isAfter(labelDate, gridEnd)) {
      monthLabels.push({ key: toDayKey(labelDate), label: format(currentMonth, "MMM") });
    }
    currentMonth = startOfMonth(subDays(monthEnd, -1));
  }

  const totalSubmissions = Array.from(counts.values()).reduce((total, count) => total + count, 0);
  const activeDays = cells.filter((cell) => cell.inRange && cell.count > 0).length;
  const maxStreak = computeMaxStreak(cells);

  return (
    <div className="min-w-[860px] space-y-4">
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Submissions (1Y)</div>
          <div className="font-display text-xl font-bold">{totalSubmissions}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Active days</div>
          <div className="font-display text-xl font-bold">{activeDays}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Max streak</div>
          <div className="font-display text-xl font-bold">{maxStreak}</div>
        </div>
      </div>

      <div className="inline-flex min-w-full flex-col gap-3">
        <div className="flex gap-1 pl-8 text-xs text-muted-foreground">
          {weeks.map((week) => {
            const firstVisibleDay = week.find((day) => day.inRange);
            const label = firstVisibleDay
              ? monthLabels.find((month) => month.key === toDayKey(startOfWeek(firstVisibleDay.date, { weekStartsOn: 0 })))?.label
              : undefined;

            return (
              <div key={toDayKey(week[0].date)} className="w-3">
                {label ?? ""}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col justify-between py-0.5 text-[10px] text-muted-foreground">
            <span>Sun</span>
            <span>Tue</span>
            <span>Thu</span>
            <span>Sat</span>
          </div>
          <div className="flex gap-1">
            {weeks.map((week) => (
              <div key={toDayKey(week[0].date)} className="grid grid-rows-7 gap-1">
                {week.map((day) => {
                  const title = `${format(day.date, "dd MMM yyyy")} • ${day.count} submission${day.count === 1 ? "" : "s"}`;
                  return (
                    <div
                      key={toDayKey(day.date)}
                      title={title}
                      className={`h-3 w-3 rounded-[3px] border border-border/40 ${getIntensityClass(day.count, day.inRange)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
          <span>Less</span>
          <div className="h-3 w-3 rounded-[3px] border border-border/40 bg-secondary" />
          <div className="h-3 w-3 rounded-[3px] border border-border/40 bg-primary/35" />
          <div className="h-3 w-3 rounded-[3px] border border-border/40 bg-primary/60" />
          <div className="h-3 w-3 rounded-[3px] border border-border/40 bg-primary" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
