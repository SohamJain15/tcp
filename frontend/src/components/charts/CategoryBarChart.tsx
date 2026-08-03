import { useIsNarrow } from "@/hooks/use-mobile";
import { memo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { chartAxisTick, chartTooltipItemStyle, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-theme";
import { ChartEmptyState } from "./ChartCard";
import { SERIES_COLORS } from "./chart-constants";

export interface BarSeries {
  dataKey: string;
  name: string;
  color?: string;
  stackId?: string;
}

interface CategoryBarChartProps {
  data: Record<string, unknown>[];
  categoryKey: string;
  bars: BarSeries[];
  /** Per-category colours, keyed by the category value (e.g. difficulty or activity level). */
  colorByCategory?: Record<string, string>;
  /** "vertical" puts categories on the Y axis — needed for long labels like problem titles. */
  layout?: "horizontal" | "vertical";
  emptyMessage?: string;
}

export const CategoryBarChart = memo(function CategoryBarChart({
  data,
  categoryKey,
  bars,
  colorByCategory,
  layout = "horizontal",
  emptyMessage = "No data yet.",
}: CategoryBarChartProps) {
  // Category labels need room, but a fixed 140px is over a third of a 375px phone screen.
  // Called before the empty-state return so hook order stays stable across renders.
  const isNarrow = useIsNarrow();
  const yAxisWidth = isNarrow ? 84 : 140;

  const isEmpty =
    data.length === 0 || data.every((entry) => bars.every((bar) => Number(entry[bar.dataKey] ?? 0) === 0));

  if (isEmpty) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  const isVertical = layout === "vertical";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={layout}
        margin={isVertical ? { top: 8, right: 16, bottom: 0, left: 8 } : { top: 8, right: 8, bottom: 0, left: -18 }}
      >
        {isVertical ? (
          <>
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={chartAxisTick} />
            <YAxis
              type="category"
              dataKey={categoryKey}
              // 140px swallows over a third of a phone screen; the label column scales instead.
              width={yAxisWidth}
              tickLine={false}
              axisLine={false}
              tick={chartAxisTick}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={categoryKey} tickLine={false} axisLine={false} tick={chartAxisTick} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={chartAxisTick} />
          </>
        )}
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
        />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name}
            stackId={bar.stackId}
            radius={0}
            maxBarSize={44}
            fill={bar.color ?? SERIES_COLORS.primary}
            animationDuration={500}
            animationEasing="ease-out"
          >
            {colorByCategory
              ? data.map((entry) => {
                  const category = String(entry[categoryKey]);
                  return (
                    <Cell key={category} fill={colorByCategory[category] ?? SERIES_COLORS.primary} />
                  );
                })
              : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
});
