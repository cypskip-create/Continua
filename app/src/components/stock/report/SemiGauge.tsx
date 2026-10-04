interface SemiGaugeProps {
  label: string;
  value: number | null; // percent
  industryValue: number | null;
  max?: number;
  companyLabel?: string;
}

/** The ROE/ROA/ROCE semicircle gauge style — needle position from 0 to
 *  `max`, red/amber/green bands, company value vs an industry reference
 *  line. Used wherever Continua has a real point-in-time ratio to show. */
export function SemiGauge({ label, value, industryValue, max = 40, companyLabel = "Company" }: SemiGaugeProps) {
  const clamped = value == null ? 0 : Math.max(0, Math.min(max, value));
  const angle = (clamped / max) * 180;
  const cx = 100, cy = 95, r = 78;
  const nx = cx - r * Math.cos((angle * Math.PI) / 180);
  const ny = cy - r * Math.sin((angle * Math.PI) / 180);

  return (
    <div>
      <svg viewBox="0 0 200 110" className="w-full max-w-[220px] mx-auto">
        <defs>
          <linearGradient id={`semigauge-${label}`} x1="0%" x2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <path d="M 20 95 A 80 80 0 0 1 180 95" stroke={`url(#semigauge-${label})`} strokeWidth="10" fill="none" strokeLinecap="round" />
        {value != null && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="4" fill="hsl(var(--foreground))" />
          </>
        )}
      </svg>
      <div className="text-center -mt-2">
        <p className="text-sm font-bold">{label}</p>
        <div className="flex items-center justify-center gap-4 mt-1">
          <span className="text-[0.6875rem]"><span className="text-primary font-semibold">{companyLabel}</span> {value != null ? `${value.toFixed(1)}%` : "—"}</span>
          <span className="text-[0.6875rem] text-muted-foreground">Industry {industryValue != null ? `${industryValue.toFixed(1)}%` : "—"}</span>
        </div>
      </div>
    </div>
  );
}
