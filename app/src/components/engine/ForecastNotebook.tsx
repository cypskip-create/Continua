import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  engineAdvancedApi,
  type PrivateForecast,
} from "@/api/engineAdvancedApi";
import { useAuth } from "@/hooks/useAuth";
import { ResearchChart } from "@/components/markets/ResearchChart";
import { ExportResearch } from "./ResearchExport";
const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
const percent = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;
export function ForecastNotebook({ symbol }: { symbol: string }) {
  const { user } = useAuth(),
    client = useQueryClient(),
    key = ["continua", "forecast-notebook", user?.id];
  const q = useQuery({
    queryKey: key,
    queryFn: engineAdvancedApi.notebook,
    enabled: !!user,
    staleTime: 60000,
    retry: false,
  });
  const [question, setQuestion] = useState(""),
    [rules, setRules] = useState(""),
    [deadline, setDeadline] = useState(""),
    [probability, setProbability] = useState("50"),
    [rationale, setRationale] = useState("");
  const invalidate = () => client.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: () =>
      engineAdvancedApi.create({
        symbol,
        question,
        rules,
        deadline: deadline + "T23:59:59Z",
        probability: Number(probability) / 100,
        rationale,
      }),
    onSuccess: () => {
      setQuestion("");
      setRules("");
      setRationale("");
      void invalidate();
    },
  });
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">Research questions</h2>
      <p className="text-sm text-muted-foreground">
        A private, non-trading forecast notebook. Write a clear yes/no question,
        define how it will be resolved and record your probability. No betting,
        crowd odds, leaderboard or rewards.
      </p>
      <form
        className="space-y-3 rounded-2xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <p className="font-semibold">New question · {symbol}</p>
        <label className="block text-sm">
          Yes/no question
          <input
            required
            minLength={10}
            maxLength={400}
            className={field}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will the next reported annual revenue exceed the previous year?"
          />
        </label>
        <label className="block text-sm">
          Resolution rules and authoritative source
          <textarea
            required
            minLength={20}
            maxLength={2000}
            className={field}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="Specify the fiscal year, statement scope, exact metric, source, threshold and what makes the question void."
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Deadline (end of day UTC)
            <input
              required
              type="date"
              className={field}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Your probability (%)
            <input
              required
              type="number"
              min={0}
              max={100}
              step={0.1}
              className={field}
              value={probability}
              onChange={(e) => setProbability(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-sm">
          Why this probability?
          <textarea
            required
            minLength={5}
            maxLength={2000}
            className={field}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Rules and deadline lock after saving. Probabilities can be revised
          only before the deadline. Outcomes you later record are labelled
          user-reported, not Engine-verified.
        </p>
        <button
          disabled={create.isPending}
          className="rounded-full bg-primary px-4 py-2 text-primary-foreground"
        >
          Save private question
        </button>
        {create.error && (
          <p role="alert" className="text-sm text-destructive">
            {create.error.message}
          </p>
        )}
      </form>
      {q.isLoading && <p role="status">Loading your questions…</p>}
      {q.error && (
        <p role="alert">
          {q.error.message}{" "}
          <button onClick={() => void q.refetch()}>Retry</button>
        </p>
      )}
      {q.data && (
        <>
          <section className="space-y-3 rounded-2xl border p-4">
            <h3 className="font-semibold">Your private calibration</h3>
            <p className="text-sm">
              {q.data.calibration.resolvedCount} resolved · initial Brier{" "}
              {q.data.calibration.initialBrier?.toFixed(3) ?? "—"} · latest
              Brier {q.data.calibration.latestBrier?.toFixed(3) ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {q.data.calibration.methodology}
            </p>
            {q.data.calibration.warning && (
              <p className="text-xs text-muted-foreground">
                {q.data.calibration.warning}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th>Probability bin</th>
                    <th>Questions</th>
                    <th>Mean forecast</th>
                    <th>Observed yes</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.calibration.bins.map((b) => (
                    <tr className="border-t" key={b.range}>
                      <td className="py-2">{b.range}</td>
                      <td>{b.count}</td>
                      <td>{percent(b.meanProbability)}</td>
                      <td>{percent(b.observedYesRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {!q.data.forecasts.length && (
            <p className="text-sm">No saved questions yet.</p>
          )}
          {q.data.forecasts.map((f) => (
            <QuestionCard
              key={`${user?.id}:${f.id}`}
              forecast={f}
              onSaved={invalidate}
            />
          ))}
          <ExportResearch name="private-forecast-notebook" data={q.data} />
        </>
      )}
    </section>
  );
}
function QuestionCard({
  forecast: f,
  onSaved,
}: {
  forecast: PrivateForecast;
  onSaved: () => Promise<unknown>;
}) {
  const [p, setP] = useState(String(f.probability * 100)),
    [why, setWhy] = useState(""),
    [source, setSource] = useState(""),
    [note, setNote] = useState(""),
    [outcome, setOutcome] = useState<"yes" | "no" | "void">("yes");
  const revise = useMutation({
    mutationFn: () => engineAdvancedApi.revise(f.id, Number(p) / 100, why),
    onSuccess: () => {
      setWhy("");
      void onSaved();
    },
  });
  const resolve = useMutation({
    mutationFn: () => engineAdvancedApi.resolve(f.id, outcome, source, note),
    onSuccess: () => {
      void onSaved();
    },
  });
  const before = Date.parse(f.deadline) > Date.now();
  return (
    <article className="space-y-3 rounded-2xl border p-4">
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">
          {f.symbol} · {f.question}
        </h3>
        <span className="text-primary">{percent(f.probability)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {f.status} · deadline {new Date(f.deadline).toISOString()}
      </p>
      <details>
        <summary className="text-sm">Locked resolution rules</summary>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {f.rules}
        </p>
      </details>
      <ResearchChart
        data={f.revisions.map((r, i) => ({
          date: `Revision ${i + 1}`,
          probability: r.probability * 100,
        }))}
        lines={[
          {
            key: "probability",
            label: "Your recorded probability (%)",
            color: "#4b7bf5",
          },
        ]}
      />
      <details>
        <summary className="text-sm">Probability revision history</summary>
        {f.revisions.map((r, i) => (
          <p key={i} className="py-2 text-xs">
            {r.at} · {percent(r.probability)} · {r.rationale}
          </p>
        ))}
      </details>
      {f.status === "open" && before && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            revise.mutate();
          }}
        >
          <label className="text-sm">
            Revised probability (%)
            <input
              required
              type="number"
              min={0}
              max={100}
              step={0.1}
              className={field}
              value={p}
              onChange={(e) => setP(e.target.value)}
            />
          </label>
          <label className="text-sm">
            New evidence or reasoning
            <textarea
              required
              minLength={5}
              maxLength={2000}
              className={field}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
          <button disabled={revise.isPending} className="text-primary">
            Record revision
          </button>
        </form>
      )}
      {f.status === "open" && !before && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            resolve.mutate();
          }}
        >
          <label className="text-sm">
            User-reported outcome
            <select
              className={field}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="void">Void / ambiguous evidence</option>
            </select>
          </label>
          <label className="text-sm">
            Resolution evidence (HTTPS)
            <input
              required
              type="url"
              className={field}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Explain how the evidence meets the locked rules
            <textarea
              required
              minLength={10}
              maxLength={2000}
              className={field}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button disabled={resolve.isPending} className="text-primary">
            Finalize user-reported outcome
          </button>
          <p className="text-xs text-muted-foreground">
            Finalized outcomes cannot be edited. Ambiguous questions should be
            voided, not forced to yes/no.
          </p>
        </form>
      )}
      {f.status !== "open" && (
        <p className="text-xs text-muted-foreground">
          User-reported outcome:{" "}
          {f.status === "void" ? "void" : f.outcome ? "yes" : "no"} ·{" "}
          {f.resolution_note} ·{" "}
          <a
            className="text-primary"
            href={f.resolution_source ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            Resolution source
          </a>
        </p>
      )}
      {(revise.error || resolve.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(revise.error || resolve.error)?.message}
        </p>
      )}
    </article>
  );
}
