import { memo, useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { chartAxisTick, chartTooltipItemStyle, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-theme";
import { ChartEmptyState } from "./ChartCard";
import { SERIES_COLORS } from "./chart-constants";

export interface TrendSeries {
  dataKey: string;
  name: string;
  color?: string;
}

interface TrendAreaChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: TrendSeries[];
  emptyMessage?: string;
}

/**
 * Memoized so unrelated query refreshes on the page do not re-trigger entry animations.
 * Gradient ids come from useId(), because two hardcoded ids would collide when more than
 * one trend chart renders on the same page — the second would inherit the first's fill.
 */
export const TrendAreaChart = memo(function TrendAreaChart({
  data,
  xKey,
  series,
  emptyMessage = "No activity yet.",
}: TrendAreaChartProps) {
  const gradientPrefix = useId().replace(/:/g, "");

  const isEmpty =
    data.length === 0 ||
    data.every((entry) => series.every((item) => Number(entry[item.dataKey] ?? 0) === 0));

  if (isEmpty) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          {series.map((item, index) => (
            <linearGradient key={item.dataKey} id={`${gradientPrefix}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color ?? SERIES_COLORS.accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={item.color ?? SERIES_COLORS.accent} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={chartAxisTick} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={chartAxisTick} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        {series.map((item, index) => (
          <Area
            key={item.dataKey}
            type="monotone"
            dataKey={item.dataKey}
            name={item.name}
            stroke={item.color ?? SERIES_COLORS.accent}
            strokeWidth={2}
            fill={`url(#${gradientPrefix}-${index})`}
            animationDuration={500}
            animationEasing="ease-out"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
});
