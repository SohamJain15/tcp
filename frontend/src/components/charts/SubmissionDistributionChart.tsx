import { memo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  chartAxisTick,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-theme";
import type { MetricDistribution } from "@/api/types";
import { ChartEmptyState } from "./ChartCard";
import { SERIES_COLORS } from "./chart-constants";

interface SubmissionDistributionChartProps {
  distribution: MetricDistribution;
  /** Unit suffix for axis and tooltip labels, e.g. "ms" or "MB". */
  unit: string;
  /** Divides the raw values for display — memory arrives in KB but reads better in MB. */
  scale?: number;
}

function formatBound(value: number, scale: number): string {
  const scaled = value / scale;
  return scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(scaled >= 10 ? 0 : 1);
}

/**
 * LeetCode-style distribution of a problem's accepted submissions, with the student's own bucket
 * highlighted.
 *
 * The caller is responsible for showing the comparison basis next to this — a highlighted bar
 * says "you are here" but not "here among whom", and a percentile over four submissions should
 * not look as authoritative as one over four hundred.
 */
export const SubmissionDistributionChart = memo(function SubmissionDistributionChart({
  distribution,
  unit,
  scale = 1,
}: SubmissionDistributionChartProps) {
  if (distribution.buckets.length === 0) {
    return <ChartEmptyState message="No accepted submissions to compare against yet." />;
  }

  const data = distribution.buckets.map((bucket) => ({
    label: `${formatBound(bucket.rangeStart, scale)}${unit}`,
    range: `${formatBound(bucket.rangeStart, scale)}–${formatBound(bucket.rangeEnd, scale)}${unit}`,
    count: bucket.count,
    isYours: bucket.isYours,
  }));

  return (
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
            <Cell
              key={entry.label}
              fill={entry.isYours ? SERIES_COLORS.success : SERIES_COLORS.muted}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});
