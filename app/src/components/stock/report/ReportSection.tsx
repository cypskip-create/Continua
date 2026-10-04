interface ReportSectionProps {
  number: number;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}

/** A numbered top-level report section (1 Valuation, 2 Future Growth,
 *  etc.) — the outer shell every major stock-report section uses.
 *  Sub-widgets inside use SubWidget for the "N.N Title" style. */
export function ReportSection({ number, title, intro, children }: ReportSectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-serif text-muted-foreground/50 shrink-0">{number}</span>
        <h2 className="text-xl font-serif font-bold">{title}</h2>
      </div>
      {intro && <p className="text-[0.75rem] text-muted-foreground -mt-3">{intro}</p>}
      {children}
    </div>
  );
}

interface SubWidgetProps {
  number: string; // e.g. "1.1"
  title: string;
  description?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}

export function SubWidget({ number, title, description, right, children }: SubWidgetProps) {
  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.8125rem] font-serif text-muted-foreground/50 shrink-0">{number}</span>
          <h3 className="text-[0.9375rem] font-serif font-bold">{title}</h3>
        </div>
        {right}
      </div>
      {description && <p className="text-[0.71875rem] text-muted-foreground mb-3">{description}</p>}
      {children}
    </div>
  );
}
