import { memo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  chartAxisTick,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import type { PercentileDistribution } from "@/api/types";
import { ChartEmptyState } from "./ChartCard";
import { SERIES_COLORS } from "./chart-constants";

interface SubmissionDistributionChartProps {
  distribution: PercentileDistribution;
}

/** Distribution of language-normalized efficiency scores on a fixed 0-100 scale. */
export const SubmissionDistributionChart = memo(function SubmissionDistributionChart({
  distribution,
}: SubmissionDistributionChartProps) {
  if (distribution.buckets.length === 0) {
    return <ChartEmptyState message="No accepted submissions to compare against yet." />;
  }

  const data = distribution.buckets.map((bucket) => ({
    label: `${bucket.rangeStart}-${bucket.rangeEnd}%`,
    range: `${bucket.rangeStart}%-${bucket.rangeEnd}% efficiency score`,
    count: bucket.count,
    isYours: bucket.isYours,
  }));

  // The bucket the student's own solution falls in — the one fact that used to live only in the
  // hover tooltip, which never fires on touch. Surfaced as a caption so it is always readable.
  const yourBucket = distribution.buckets.find((bucket) => bucket.isYours);

  return (
    <div className="flex h-full w-full flex-col">
      {yourBucket && (
        <p className="mb-1 shrink-0 text-[11px] text-muted-foreground">
          Your solution sits in the{" "}
          <span className="font-semibold text-success">
            {yourBucket.rangeStart}%–{yourBucket.rangeEnd}%
          </span>{" "}
          band.
        </p>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={chartAxisTick} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={chartAxisTick} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
          labelFormatter={(_label, payload) => payload?.[0]?.payload?.range ?? ""}
          formatter={(value: number, _name, item) => [
            `${value} submission${value === 1 ? "" : "s"}${item?.payload?.isYours ? " (you)" : ""}`,
            "Count",
          ]}
        />
        <Bar dataKey="count" radius={0} maxBarSize={44} animationDuration={500} animationEasing="ease-out">
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.isYours ? SERIES_COLORS.success : SERIES_COLORS.muted} />
          ))}
        </Bar>
      </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
