import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';

type Readout = { label: string; values: { name: string; value: string; color?: string }[] };
const ReadoutContext = createContext<((value: Readout | null) => void) | null>(null);
const number = new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function chartValue(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? number.format(value) : '—';
  if (Array.isArray(value)) return value.map(chartValue).join(' – ');
  return value == null ? '—' : String(value);
}

/** Reserve space above the plot, so inspecting data never obscures the curve. */
export function InlineChartContainer({ children, width = '100%', height = '100%', ...props }: ComponentProps<typeof ResponsiveContainer>) {
  const [readout, setReadout] = useState<Readout | null>(null);
  return <ReadoutContext.Provider value={setReadout}>
    <div style={{ width, height, minWidth: 0, display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
      <div className="min-h-9 shrink-0 flex flex-wrap justify-end items-center gap-x-3 gap-y-1 text-xs tabular-nums pb-2" aria-label="Chart values">
        {readout && <><span className="text-muted-foreground">{readout.label}</span>{readout.values.map((item, index) => <span key={index} style={{ color: item.color }}>{item.name}: <strong>{item.value}</strong></span>)}</>}
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}><ResponsiveContainer {...props} width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  </ReadoutContext.Provider>;
}

function ReadoutContent({ active, payload, label }: { active?: boolean; payload?: readonly { name?: unknown; value?: unknown; color?: string; dataKey?: unknown }[]; label?: unknown }) {
  const publish = useContext(ReadoutContext);
  const serialized = JSON.stringify(active && payload?.length ? { label: String(label ?? ''), values: payload.filter(item => item.dataKey !== 'band').map(item => ({ name: String(item.name ?? item.dataKey ?? ''), value: chartValue(item.value), color: item.color })) } : null);
  const readout = useMemo(() => JSON.parse(serialized) as Readout | null, [serialized]);
  useEffect(() => { publish?.(readout); }, [publish, readout]);
  useEffect(() => () => publish?.(null), [publish]);
  return null;
}

export function InlineChartTooltip(props: ComponentProps<typeof Tooltip>) {
  return <Tooltip {...props} content={<ReadoutContent />} />;
}
