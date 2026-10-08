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
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
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
    <div className="border-t border-border/70 py-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {right}
      </div>
      {description && <p className="text-sm text-muted-foreground mb-2">{description}</p>}
      {children}
    </div>
  );
}
