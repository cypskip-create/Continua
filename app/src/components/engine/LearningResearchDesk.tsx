import { useQuery } from "@tanstack/react-query";
import { engineAdvancedApi } from "@/api/engineAdvancedApi";
import { useAuth } from "@/hooks/useAuth";
export function LearningResearchDesk({
  onTool,
  onCompany,
}: {
  onTool: (tool: string) => void;
  onCompany: (symbol: string) => void;
}) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["continua", "engine-recommendations", user?.id],
    queryFn: engineAdvancedApi.recommendations,
    enabled: !!user,
    staleTime: 60000,
    retry: false,
  });
  if (q.isError)
    return (
      <p className="text-xs text-muted-foreground">
        Research shortcuts could not update. Your company calculations are
        unaffected.
      </p>
    );
  if (!q.data) return null;
  return (
    <section
      aria-label="Personal research shortcuts"
      className="space-y-3 rounded-xl border p-4"
    >
      <h3 className="font-semibold">Your research focus</h3>
      <p className="text-xs text-muted-foreground">{q.data.reason}</p>
      <div className="flex flex-wrap gap-2">
        {q.data.tools.map((t) => (
          <button
            key={t}
            className="rounded-full border px-3 py-2 text-xs"
            onClick={() => onTool(t)}
          >
            {t} →
          </button>
        ))}
      </div>
      {q.data.companies.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {q.data.companies.map((c) => (
            <button
              key={c.symbol}
              className="rounded-lg bg-muted p-3 text-left"
              onClick={() => onCompany(c.symbol)}
            >
              <span className="text-sm font-semibold">{c.symbol}</span>
              <p className="text-xs text-muted-foreground">{c.reason}</p>
            </button>
          ))}
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary>How personalization works</summary>
        <p className="mt-2">{q.data.methodology}</p>
        <button
          className="mt-2 text-primary"
          onClick={() => onTool("Preferences")}
        >
          Manage or reset learning →
        </button>
      </details>
    </section>
  );
}
