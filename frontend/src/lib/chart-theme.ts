// Sharp-cornered, token-driven recharts styling so tooltips stay readable in
// light AND dark mode across every page.
export const chartTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  boxShadow: "var(--shadow-card)",
};

export const chartTooltipLabelStyle = { color: "hsl(var(--foreground))", fontWeight: 600 };
export const chartTooltipItemStyle = { color: "hsl(var(--foreground))" };

export const chartAxisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
