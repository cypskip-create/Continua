import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { engineAdvancedApi } from "@/api/engineAdvancedApi";
export function PipelineHealthDesk() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["continua", "pipeline-health", user?.id],
    queryFn: engineAdvancedApi.pipeline,
    staleTime: 60000,
    retry: false,
    enabled: !!user,
  });
  return (
    <details className="rounded-xl border p-4">
      <summary className="text-sm font-semibold">
        Engine processing health
      </summary>
      {q.isLoading && <p className="text-xs">Checking processing health…</p>}
      {q.error && (
        <p className="mt-3 text-xs text-muted-foreground">
          Processing status could not load; this does not mean your stored
          statements were deleted.{" "}
          <button onClick={() => void q.refetch()} className="text-primary">
            Retry
          </button>
        </p>
      )}
      {q.data && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            {q.data.status} · {q.data.checkedAt}
          </p>
          {q.data.checks.map((c) => (
            <p key={c.name} className="text-xs">
              {c.name}: {c.ok ? "available" : "requires attention"}
            </p>
          ))}
          {q.data.validations.map((v) => (
            <p key={v.outcome} className="text-xs">
              {v.outcome}: {v.count} recorded extractions · latest {v.latest}
            </p>
          ))}
          {q.data.limits.map((l) => (
            <p key={l} className="text-xs text-muted-foreground">
              {l}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">{q.data.methodology}</p>
        </div>
      )}
    </details>
  );
}
