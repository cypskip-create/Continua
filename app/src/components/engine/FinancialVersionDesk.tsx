import { useQuery } from "@tanstack/react-query";
import { engineAdvancedApi } from "@/api/engineAdvancedApi";
import { ExportResearch } from "./ResearchExport";
export function FinancialVersionDesk({ symbol }: { symbol: string }) {
  const q = useQuery({
    queryKey: ["continua", "financial-versions", symbol],
    queryFn: () => engineAdvancedApi.versions(symbol),
    staleTime: 60000,
    retry: false,
  });
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Financial change audit</h3>
      {q.isLoading && <p role="status">Loading recorded changes…</p>}
      {q.error && (
        <p role="alert" className="text-sm text-muted-foreground">
          Change history could not load.{" "}
          <button onClick={() => void q.refetch()} className="text-primary">
            Retry
          </button>
        </p>
      )}
      {q.data && (
        <>
          <p className="text-xs text-muted-foreground">{q.data.methodology}</p>
          {!q.data.versions.length && (
            <p className="text-sm">
              No recorded canonical changes since audit deployment.
            </p>
          )}
          {q.data.versions.slice(0, 20).map((v) => (
            <details key={v.id} className="border-b py-2">
              <summary className="text-sm">
                {v.operation} · {v.table_name.replaceAll("_", " ")} ·{" "}
                {v.recorded_at}
              </summary>
              <p className="text-xs">Period: {v.period_id}</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(
                  { before: v.before_payload, after: v.after_payload },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
          <ExportResearch name={`${symbol}-financial-versions`} data={q.data} />
        </>
      )}
    </section>
  );
}
