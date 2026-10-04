export interface KeyInfoRow {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface UpdateItem {
  id: string;
  kind: "announcement" | "earnings" | "dividend" | "people" | "other";
  date: string;
  title: string;
  detail?: string;
  url?: string | null;
}

interface KeyInfoUpdatesProps {
  rows: KeyInfoRow[];
  updates: UpdateItem[];
  updatesTitle?: string;
}

/** The two-column "Key information" / "Recent updates" block every major
 *  report section carries — updates are section-scoped (recent dividend
 *  updates under Dividends, recent management updates under Management),
 *  not one global feed. */
export function KeyInfoUpdates({ rows, updates, updatesTitle = "Recent updates" }: KeyInfoUpdatesProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="card-gradient rounded-2xl p-4">
        <p className="section-eyebrow mb-3">Key information</p>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label} className={r.highlight ? "border-l-2 border-primary pl-2.5" : ""}>
              {r.highlight ? (
                <>
                  <p className="text-lg font-bold tabular">{r.value}</p>
                  <p className="text-[0.65625rem] text-muted-foreground">{r.label}</p>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[0.71875rem] text-muted-foreground underline decoration-dotted underline-offset-2">{r.label}</span>
                  <span className="text-[0.75rem] font-semibold tabular">{r.value}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card-gradient rounded-2xl p-4">
        <p className="section-eyebrow mb-3">{updatesTitle}</p>
        {updates.length === 0 ? (
          <p className="text-[0.71875rem] text-muted-foreground py-4 text-center">No updates on file yet.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {updates.slice(0, 4).map((u) => (
              <a
                key={u.id}
                href={u.url ?? undefined}
                target={u.url ? "_blank" : undefined}
                rel={u.url ? "noopener noreferrer" : undefined}
                className={`block py-2.5 ${u.url ? "active:opacity-70" : ""}`}
              >
                <p className="text-[0.625rem] text-muted-foreground">{u.date}</p>
                <p className="text-[0.75rem] font-semibold mt-0.5 leading-snug">{u.title}</p>
                {u.detail && <p className="text-[0.6875rem] text-muted-foreground mt-0.5 line-clamp-2">{u.detail}</p>}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
