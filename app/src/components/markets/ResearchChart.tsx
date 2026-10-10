import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";
export interface ChartPoint {
  date: string;
  [key: string]: string | number | number[] | undefined;
}
export function ResearchChart({
  data,
  lines,
  band = false,
}: {
  data: ChartPoint[];
  lines: { key: string; label: string; color: string; dashed?: boolean }[];
  band?: boolean;
}) {
  if (data.length === 0)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No verified observations are available for this chart yet.
      </p>
    );
  const Chart = band ? ComposedChart : LineChart;
  return (
    <div
      className="w-full min-w-0"
      role="img"
      aria-label={lines.map((l) => l.label).join(" compared with ")}
    >
      <ResponsiveContainer width="100%" height={260}>
        <Chart data={data} margin={{ top: 16, right: 14, bottom: 8, left: 0 }}>
          <CartesianGrid
            stroke="hsl(var(--border))"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: "0.6875rem" }}
            minTickGap={50}
          />
          <YAxis
            width={48}
            domain={["auto", "auto"]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: "0.6875rem" }}
            tickFormatter={(v) => Number(v).toFixed(1)}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--foreground))",
            }}
          />
          {band && (
            <Area
              dataKey="band"
              name="Illustrative variability range"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.12}
              isAnimationActive={false}
            />
          )}
          {lines.map((line) => (
            <Line
              key={line.key}
              dataKey={line.key}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={data.length === 1 ? { r: 4 } : false}
              strokeDasharray={line.dashed ? "4 4" : undefined}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
          {band && <ReferenceLine y={100} stroke="hsl(var(--border))" />}
        </Chart>
      </ResponsiveContainer>
      {data.length === 1 && <p className="text-xs text-muted-foreground text-center mb-3">One reported observation; not enough history to establish a trend.</p>}
      <div className="flex flex-wrap gap-4 text-xs justify-center">
        {lines.map((line) => (
          <span key={line.key}>
            <span style={{ color: line.color }}>●</span> {line.label}
          </span>
        ))}
      </div>
    </div>
  );
}
