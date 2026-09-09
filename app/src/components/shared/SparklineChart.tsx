interface SparklineChartProps {
  /** Real recent closes, oldest first. Pass `undefined` (not a fabricated
   *  series) when real data isn't available yet — this component renders
   *  an honest empty placeholder in that case rather than inventing a
   *  trend line. See useSparklines for the batch fetch that supplies this. */
  data?: number[];
  width?: number;
  height?: number;
  isPositive?: boolean;
  isLoading?: boolean;
}

export const SparklineChart = ({
  data,
  width = 60,
  height = 24,
  isPositive = true,
  isLoading = false,
}: SparklineChartProps) => {
  if (!data || data.length < 2) {
    // Honest empty state — a flat dashed line, never a randomly generated
    // trend. No fabricated data, ever, per project policy.
    return (
      <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={isLoading ? 0.25 : 0.15}
          strokeWidth="1.5"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  const strokeColor = isPositive ? "hsl(var(--bull))" : "hsl(var(--bear))";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};