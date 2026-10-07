import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEnginePreferences } from "@/hooks/useEnginePreferences";
import {
  engineWorkspaceApi,
  type EnginePreferences,
  type MonitorRule,
} from "@/api/engineWorkspaceApi";
import type { EngineBundle } from "@/api/engineApi";
import { PortfolioReviewDesk } from "./PortfolioReviewDesk";
import { ResearchChart } from "@/components/markets/ResearchChart";
import { engineReadRetry } from "@/api/engineRetry";
import { FocusedComparison } from "./FocusedComparison";
const control =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-0";
const action =
  "rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50";
const number = (n: number | null | undefined, suffix = "") =>
  n == null || !Number.isFinite(n)
    ? "Unavailable"
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + suffix;
const error = (value: unknown) =>
  value instanceof Error
    ? value.message
    : "The request could not be completed.";
function Notice({ value }: { value: unknown }) {
  return value ? (
    <p role="alert" className="text-sm text-bear">
      {error(value)}
    </p>
  ) : null;
}
export function EngineInsights({ data }: { data: EngineBundle }) {
  if (!data.quality) return null;
  return (
    <section className="space-y-6" aria-label="Engine evidence and changes">
      <div>
        <h3 className="text-lg font-semibold">What changed?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.changes?.baseline
            ? "This is the first complete research baseline. Changes appear after new evidence is observed."
            : `Compared with ${data.changes?.comparedAsOf ? new Date(data.changes.comparedAsOf).toLocaleString() : "the previous complete research snapshot"}.`}
        </p>
        {data.changes?.changes.map((item, index) => (
          <p key={index} className="mt-2 text-sm">
            <strong>{item.topic}</strong> · {item.text}
          </p>
        ))}
        {!data.changes?.baseline && !data.changes?.changes.length && (
          <p className="mt-2 text-sm text-muted-foreground">
            No research changes in the tracked inputs.
          </p>
        )}
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Evidence quality</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Quote:{" "}
          {data.quality.quoteAsOf
            ? new Date(data.quality.quoteAsOf).toLocaleString()
            : "Unavailable"}{" "}
          · {data.quality.quoteSource ?? "Unknown source"}
          <br />
          Financial period ended {data.quality.periodEnd ?? "Unavailable"} ·
          filed {data.quality.filedAt ?? "Unavailable"}
        </p>
        {data.quality.warnings.map((w) => (
          <p key={w} className="mt-2 text-sm text-bear">
            {w}
          </p>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">
          {data.quality.priceAdjustmentBasis}
        </p>
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold">
          Earnings quality · FY{data.financialAnalysis?.period ?? "—"}
        </h3>
        <div className="grid grid-cols-2 gap-4 mt-3">
          {Object.entries(data.financialAnalysis?.metrics ?? {}).map(
            ([key, value]) => (
              <div key={key}>
                <p className="text-xs text-muted-foreground">
                  {key.replace(/([A-Z])/g, " $1")}
                </p>
                <p className="text-sm font-semibold">
                  {number(value, /Growth|dilution/.test(key) ? "%" : "")}
                </p>
              </div>
            ),
          )}
        </div>
        {data.financialAnalysis?.findings.map((f) => (
          <p key={f} className="mt-3 text-sm text-muted-foreground">
            {f}
          </p>
        ))}
        <p className="mt-3 text-xs text-muted-foreground">
          {data.financialAnalysis?.sectorNote}
        </p>
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Dividend sustainability</h3>
        <p className="mt-2 text-sm">
          Trailing dividend per share:{" "}
          {number(data.dividendAnalysis?.trailingDps)} {data.currency}
          <br />
          Payout relative to annual EPS:{" "}
          {number(data.dividendAnalysis?.payoutRatio, "×")}
          <br />
          Free cash flow / net income:{" "}
          {number(data.dividendAnalysis?.coverage, "×")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Trailing dividends and annual earnings may cover different dates.
          These ratios require period matching before drawing conclusions.
        </p>
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Scenario comparison</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {data.scenarios?.map((s) => (
            <div
              key={s.name}
              className="border-t border-border py-3 sm:border-t-0 sm:border-l sm:first:border-l-0 sm:pl-3"
            >
              <p className="text-sm font-semibold">
                {s.name} · {s.growthPercent}%
              </p>
              <p className="text-xs mt-2">
                Revenue: {number(s.revenue)}
                <br />
                Net income: {number(s.netIncome)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.assumption}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
export function EnginePreferencesPanel() {
  const { settings, query, save } = useEnginePreferences();
  const [draft, setDraft] = useState<EnginePreferences>(settings);
  const client = useQueryClient(),
    { user } = useAuth();
  useEffect(() => {
    setDraft(settings);
  }, [settings]);
  const reset = useMutation({
    mutationFn: () => engineWorkspaceApi.visit("KCB", "NSE", true),
    onSuccess: (value) => {
      client.setQueryData(["continua", "engine-preferences", user?.id], value);
    },
  });
  const select = (
    label: string,
    key: "goal" | "horizon" | "experience" | "riskComfort" | "incomeNeeds",
    choices: string[],
  ) => (
    <label className="flex flex-col gap-1 text-xs" key={key}>
      {label}
      <select
        className={control}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      >
        {choices.map((v) => (
          <option key={v} value={v}>
            {v.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Research preferences</h3>
      <Notice value={query.error} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(draft);
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {select("Goal", "goal", [
            "Balanced",
            "Income",
            "Growth",
            "Capital preservation",
            "Short-term trading",
          ])}
          {select("Investment horizon", "horizon", [
            "under_1_year",
            "1_to_5_years",
            "over_5_years",
          ])}
          {select("Experience", "experience", [
            "beginner",
            "intermediate",
            "experienced",
          ])}
          {select("Risk comfort", "riskComfort", [
            "unspecified",
            "lower",
            "moderate",
            "higher",
          ])}
          {select("Income needs", "incomeNeeds", [
            "none",
            "occasional",
            "regular",
          ])}
          <label className="flex flex-col gap-1 text-xs">
            Preferred sectors, separated by commas
            <input
              className={control}
              value={draft.sectors.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  sectors: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                    .slice(0, 12),
                })
              }
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.notifications}
            onChange={(e) =>
              setDraft({ ...draft, notifications: e.target.checked })
            }
          />
          Allow Engine research notifications
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.learnInterests}
            onChange={(e) =>
              setDraft({ ...draft, learnInterests: e.target.checked })
            }
          />
          Learn research interests from companies I open in Engine
        </label>
        <p className="text-xs text-muted-foreground">
          Learning is optional. Research interests do not establish risk
          tolerance or investment suitability. Your saved preferences follow
          your account across devices.
        </p>
        <button className={action} disabled={save.isPending || query.isLoading}>
          Save preferences
        </button>
        <Notice value={save.error} />
        {save.isSuccess && (
          <p role="status" className="text-xs text-primary">
            Preferences saved.
          </p>
        )}
      </form>
      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold">Your learned interests</h4>
        <p className="text-xs text-muted-foreground mt-2">
          {settings.interests.length
            ? settings.interests
                .map((i) => `${i.symbol} (${i.visits} visits)`)
                .join(" · ")
            : "No interests recorded."}
        </p>
        <button
          className={control + " mt-3"}
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
        >
          Reset learned interests
        </button>
        <Notice value={reset.error} />
      </div>
    </section>
  );
}
export function EngineAssistantPanel({
  symbol,
  exchange,
  initialScope = "company",
  portfolioOnly = false,
}: {
  symbol: string;
  exchange: string;
  initialScope?: string;
  portfolioOnly?: boolean;
}) {
  const { user } = useAuth();
  const [question, setQuestion] = useState(""),
    [scope, setScope] = useState(initialScope),
    [compare, setCompare] = useState("");
  const usage = useQuery({
    queryKey: ["continua", "engine-usage", user?.id],
    queryFn: engineWorkspaceApi.usage,
    retry: false,
  });
  const client = useQueryClient();
  const ask = useMutation({
    mutationFn: () =>
      engineWorkspaceApi.ask(
        question,
        [
          ...new Set([
            symbol,
            ...compare
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean),
          ]),
        ].slice(0, 3),
        exchange,
        scope,
      ),
    onSettled: () =>
      void client.invalidateQueries({
        queryKey: ["continua", "engine-usage", user?.id],
      }),
  });
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Ask your research assistant</h3>
      <p className="text-sm text-muted-foreground">
        Ask about reported results, news, risks or your portfolio. Answers use
        dated evidence from the selected research scope.
      </p>
      <div className="flex flex-wrap gap-2">{["Compare revenue growth","Review cash conversion and debt risk","What changed in company news?","Summarize technical observations"].map(prompt=><button key={prompt} type="button" className={control} onClick={()=>setQuestion(prompt)}>{prompt}</button>)}</div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask.mutate();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <label className="text-xs">
            Research scope
            <select
              aria-label="Assistant scope"
              className={control + " ml-2"}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {!portfolioOnly && (
                <option value="company">Company research</option>
              )}
              <option value="portfolio">My portfolio</option>
            </select>
          </label>
          {scope === "company" && (
            <label className="text-xs flex flex-col gap-1">
              Compare up to two additional symbols
              <input
                aria-label="Compare research symbols"
                className={control}
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
                placeholder="SCOM, EQTY"
              />
            </label>
          )}
        </div>
        <label className="block text-xs">
          Your question
          <textarea
            aria-label="Research question"
            className={control + " w-full mt-1 min-h-28"}
            maxLength={2000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What changed in earnings quality, and which evidence supports it?"
          />
        </label>
        <button
          className={action}
          disabled={
            ask.isPending ||
            question.trim().length < 3
          }
        >
          {ask.isPending ? "Researching…" : "Ask Engine"}
        </button>
      </form>
      <Notice value={ask.error} />
      <Notice value={usage.error} />
      {usage.data && (
        <p className="text-xs text-muted-foreground">
          {usage.data.configured
            ? `${usage.data.requests} requests this month · $${usage.data.reserved.toFixed(3)} reserved usage · ${usage.data.dailyUserLimit} requests per user/day. Application monthly cap: $${usage.data.monthlyApplicationCap}.`
            : "Calculated evidence mode: structured, sourced answers without generative AI."}{" "}
          Requests run only when you submit a question.
        </p>
      )}
      {ask.data && (
        <article className="border-t border-border pt-4 space-y-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {ask.data.answer}
          </p>
          <div>
            <h4 className="text-xs font-semibold">Evidence</h4>
            {ask.data.sources.map((source) => (
              <p key={source.id} className="text-xs mt-2">
                {source.url ? (
                  <a
                    className="text-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={source.url}
                  >
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
                {source.asOf ? ` · ${source.asOf}` : " · Date unavailable"}
              </p>
            ))}
          </div>
          {ask.data.limitations.map((l) => (
            <p key={l} className="text-xs text-muted-foreground">
              {l}
            </p>
          ))}
        </article>
      )}
    </section>
  );
}
export function EngineMonitoringPanel({
  symbol,
  exchange,
}: {
  symbol: string;
  exchange: string;
}) {
  const { user } = useAuth(),
    client = useQueryClient();
  const key = ["continua", "engine-monitoring", user?.id];
  const rules = useQuery({
    queryKey: key,
    queryFn: engineWorkspaceApi.rules,
    retry: engineReadRetry,
    refetchInterval: 60000,
  });
  const activity = useQuery({queryKey:[...key,"activity"],queryFn:engineWorkspaceApi.monitorActivity,retry:engineReadRetry});
  const check = useMutation({mutationFn:()=>engineWorkspaceApi.checkRules(symbol,exchange),onSuccess:value=>{client.setQueryData(key,value);void client.invalidateQueries({queryKey:[...key,"activity"]});void client.invalidateQueries({queryKey:["notifications"]});}});
  const [kind, setKind] = useState("material_change"),
    [threshold, setThreshold] = useState("");
  const save = useMutation({
    mutationFn: (rule: Omit<MonitorRule, "id">) =>
      engineWorkspaceApi.saveRule(rule),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: engineWorkspaceApi.deleteRule,
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Monitor your research</h3>
      <p className="text-sm text-muted-foreground">
        Automatic checks run every 10 minutes while the backend is running. In-app notifications appear when a threshold is
        crossed or tracked research changes materially. Unchanged states stay
        quiet. Your notification preference must be enabled. Missing data is never treated as a crossed threshold.
      </p>
      <button className={control} disabled={check.isPending} onClick={()=>check.mutate()}>{check.isPending?"Checking…":`Check ${symbol} now`}</button>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            symbol,
            exchange,
            kind,
            threshold: kind === "material_change" ? null : Number(threshold),
            enabled: true,
          });
        }}
      >
        <label className="text-xs flex flex-col gap-1">
          Rule for {symbol}
          <select
            aria-label="Research monitoring rule"
            className={control}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {[
              "material_change",
              "price_below",
              "price_above",
              "debt_above",
              "revenue_growth_below",
              "earnings_growth_below",
              "cash_conversion_below",
              "dividend_payout_above",
              "quote_age_above",
            ].map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        {kind !== "material_change" && (
          <label className="text-xs flex flex-col gap-1">
            Threshold{" "}
            {kind === "debt_above"
              ? "(debt/equity ratio)"
              : kind.endsWith("growth_below")
                ? "(percent)"
                : kind === "quote_age_above" ? "(days)" : ["cash_conversion_below","dividend_payout_above"].includes(kind) ? "(ratio ×)" : "(quote currency)"}
            <input
              required
              type="number"
              step="any"
              aria-label="Monitoring threshold"
              className={control}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
        )}
        <button className={action} disabled={save.isPending}>
          Save rule
        </button>
      </form>
      <Notice value={rules.error ?? save.error ?? remove.error ?? check.error} />
      {rules.data?.map((rule) => (
        <div
          key={rule.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
        >
          <div className="text-sm">
            <strong>{rule.symbol}</strong> · {rule.kind.replace(/_/g, " ")}
            {rule.threshold != null ? ` ${rule.threshold}` : ""}
            <p className="text-xs text-muted-foreground">
              {rule.enabled ? "Active" : "Paused"} · {rule.exchange}
            </p>
            <p className="text-xs text-muted-foreground">{rule.last_state?.checkedAt?`Checked ${new Date(rule.last_state.checkedAt).toLocaleString()} · ${rule.last_state.error??(rule.last_state.unavailable?"Input unavailable":rule.last_state.triggered?"Threshold crossed":"No crossing")}`:"Awaiting first check"}{rule.last_state?.value!=null?` · observed ${number(rule.last_state.value)}`:""}{rule.last_state?.asOf?` · data ${rule.last_state.asOf}`:""}</p>
          </div>
          <div className="flex gap-2">
            <button
              className={control}
              disabled={save.isPending}
              onClick={() => save.mutate({ ...rule, enabled: !rule.enabled })}
            >
              {rule.enabled ? "Pause" : "Resume"}
            </button>
            <button
              className={control}
              disabled={remove.isPending}
              onClick={() => remove.mutate(rule.id)}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <h4 className="text-sm font-semibold">Alert history</h4>
      <Notice value={activity.error} />
      {activity.data?.map(item=><div key={item.id} className="border-t border-border py-2 text-xs"><strong>{item.title}</strong><p>{item.message}</p><time>{new Date(item.created_at).toLocaleString()}</time></div>)}
      {activity.data?.length===0&&<p className="text-xs text-muted-foreground">No Engine alerts yet. New alerts appear here and in Notifications.</p>}
    </section>
  );
}
export function EnginePortfolioPanel({ exchange }: { exchange: string }) {
  const { user } = useAuth(),
    client = useQueryClient(),
    key = ["continua", "engine-portfolio", user?.id, exchange];
  const portfolio = useQuery({
    queryKey: key,
    queryFn: () => engineWorkspaceApi.portfolio(exchange),
    staleTime: 60000,
    enabled: !!user,
    retry: engineReadRetry,
  });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [amount, setAmount] = useState(""),
    [note, setNote] = useState("");
  const add = useMutation({
    mutationFn: () =>
      engineWorkspaceApi.cashFlow(exchange, date, Number(amount), note),
    onSuccess: () => {
      setAmount("");
      setNote("");
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: engineWorkspaceApi.deleteFlow,
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const p = portfolio.data;
  return (
    <section className="space-y-5">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Portfolio intelligence</h3>
        <button
          className={control}
          onClick={() => void portfolio.refetch()}
          disabled={portfolio.isFetching}
        >
          Refresh
        </button>
      </div>
      <Notice value={portfolio.error} />
      {portfolio.isLoading && (
        <p role="status" className="text-sm">
          Analysing your holdings…
        </p>
      )}
      {p && (
        <>
          <p className="text-sm">
            Covered value: {p.currency ?? ""}{" "}
            {p.available ? number(p.totalValue) : "Unavailable"} · holdings{" "}
            {p.coverage}
            <br />
            Latest-session contribution: {number(p.sessionPnl)}
          </p>
          {p.reason && (
            <p className="text-sm text-muted-foreground">{p.reason}</p>
          )}
          {[...p.warnings, ...p.historyWarnings].map((w) => (
            <p key={w} className="text-sm text-muted-foreground">
              {w}
            </p>
          ))}
          <PortfolioReviewDesk data={p} />
          {p.snapshots && p.snapshots.length > 1 && (
            <div>
              <h4 className="text-sm">Recorded invested value</h4>
              <ResearchChart
                data={p.snapshots.map((s) => ({
                  date: s.date,
                  value: s.value,
                }))}
                lines={[
                  {
                    key: "value",
                    label: "Recorded invested value",
                    color: "hsl(var(--primary))",
                  },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                Actual recorded snapshots, including external flows; not a
                total-return chart.
              </p>
            </div>
          )}
          {p.positions.map((h) => (
            <div
              key={h.symbol}
              className="border-t border-border py-2 flex justify-between gap-3 text-sm"
            >
              <span>
                {h.symbol}
                <span className="block text-xs text-muted-foreground">
                  {h.sector} · {h.asOf ?? "Date unavailable"}
                </span>
              </span>
              <span>
                {number(h.weight * 100, "%")}
                <span className="block text-xs text-muted-foreground">
                  Contribution {number(h.sessionContribution)}
                </span>
              </span>
            </div>
          ))}
          <div>
            <h4 className="text-sm font-semibold">Sector exposure</h4>
            {p.sectors.map((s) => (
              <p key={s.sector} className="text-xs mt-2">
                {s.sector} · {number(s.weight * 100, "%")}
              </p>
            ))}
          </div>
          <div>
            <h4 className="text-sm font-semibold">Correlation</h4>
            {p.correlations.pairs.map((pair) => (
              <p key={pair.a + pair.b} className="text-xs mt-2">
                {pair.a} / {pair.b}: {number(pair.correlation)}
              </p>
            ))}
            {!p.correlations.pairs.length && (
              <p className="text-xs mt-2 text-muted-foreground">
                Insufficient overlapping price history.
              </p>
            )}
            <p className="text-xs mt-2 text-muted-foreground">
              {p.correlations.methodology}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">
              Recorded invested-holdings return
            </h4>
            <p className="text-sm mt-2">
              Time-weighted: {number(p.performance.twr, "%")}
              <br />
              Annualized money-weighted:{" "}
              {number(p.performance.moneyWeighted, "%")}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {p.performance.reason}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Dividend income</h4>
            {p.dividends.map((d) => (
              <p key={d.symbol} className="mt-2 text-xs">
                {d.symbol} · trailing income {number(d.trailingIncome)}
                {d.upcoming
                  .map((e) => ` · ${e.date}: ${number(e.amount)}`)
                  .join("")}
              </p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{p.methodology}</p>
          <form
            className="border-t border-border pt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <h4 className="text-sm font-semibold">
              Record an external invested-capital flow
            </h4>
            <p className="text-xs text-muted-foreground">
              Enter deposits as positive and withdrawals as negative, in the
              displayed currency. Returns cannot account for flows you have not
              recorded.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                aria-label="Cash flow date"
                type="date"
                required
                className={control}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <input
                aria-label="Cash flow amount"
                type="number"
                step="any"
                required
                className={control}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                aria-label="Cash flow note"
                maxLength={160}
                className={control}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
              />
            </div>
            <button
              className={action}
              disabled={add.isPending || !amount || Number(amount) === 0}
            >
              Record flow
            </button>
            <Notice value={add.error ?? remove.error} />
            {p.flows.map((f) => (
              <div key={f.id} className="flex justify-between gap-2 text-xs">
                <span>
                  {f.date} · {number(f.amount)} · {f.note}
                </span>
                <button
                  data-small-target
                  className="text-primary"
                  onClick={() => remove.mutate(f.id)}
                  type="button"
                  disabled={remove.isPending}
                >
                  Remove
                </button>
              </div>
            ))}
          </form>
        </>
      )}
    </section>
  );
}
export function EnginePeersPanel({
  symbol,
  exchange,
}: {
  symbol: string;
  exchange: string;
}) {
  const peers = useQuery({
    queryKey: ["continua", "engine-peers", exchange, symbol],
    queryFn: () => engineWorkspaceApi.peers(symbol, exchange),
    staleTime: 60000,
    retry: false,
  });
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Sector peers</h3>
      <FocusedComparison key={exchange+symbol} symbol={symbol} exchange={exchange} />
      <p className="text-xs text-muted-foreground">
        Same-exchange and same-currency companies in the reported sector.
        Compare reporting years before interpreting differences.
      </p>
      <Notice value={peers.error} />
      {peers.data?.map((p) => (
        <div key={p.symbol} className="border-t border-border pt-3">
          <h4 className="text-sm font-semibold">
            {p.symbol} · {p.name} · FY{p.period ?? "—"}
          </h4>
          <p className="text-xs mt-2">
            Revenue growth {number(p.metrics.revenueGrowth, "%")} · cash
            conversion {number(p.metrics.cashConversion, "×")} · debt/equity{" "}
            {number(p.metrics.debtToEquity, "×")}
          </p>
        </div>
      ))}
      {peers.data && !peers.data.length && (
        <p className="text-sm text-muted-foreground">
          No comparable covered companies in this sector.
        </p>
      )}
    </section>
  );
}
