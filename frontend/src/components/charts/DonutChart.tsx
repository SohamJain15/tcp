import { memo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { chartTooltipItemStyle, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-theme";
import { ChartEmptyState } from "./ChartCard";

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  /** Caption under the centred total, e.g. "Total" or "Solved". */
  centerLabel?: string;
  emptyMessage?: string;
}

export const DonutChart = memo(function DonutChart({
  data,
  centerLabel = "Total",
  emptyMessage = "No data yet.",
}: DonutChartProps) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (total === 0) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-[170px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={74}
              innerRadius={50}
              paddingAngle={data.length > 1 ? 3 : 0}
              dataKey="value"
              stroke="hsl(var(--card))"
              strokeWidth={2}
              animationDuration={500}
              animationEasing="ease-out"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold leading-none">{total}</span>
          <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((entry) => (
          <span key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5" style={{ backgroundColor: entry.color }} aria-hidden />
            {entry.name}
            <span className="font-mono-code font-semibold text-foreground">{entry.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
});
