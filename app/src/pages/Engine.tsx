import {
  EngineInsights,
  EnginePreferencesPanel,
  EngineAssistantPanel,
  EngineMonitoringPanel,
  EnginePortfolioPanel,
  EnginePeersPanel,
} from "@/components/engine/EngineWorkspace";
import { useEnginePreferences } from "@/hooks/useEnginePreferences";
import { engineWorkspaceApi } from "@/api/engineWorkspaceApi";
import { engineReadRetry } from "@/api/engineRetry";
import { ResearchJournal } from "@/components/engine/ResearchJournal";
import { EngineConnectionCheck } from "@/components/engine/EngineConnectionCheck";
import { mediaStoryUrl } from "@/lib/mediaRoute";
import { useStickyHeights } from "@/hooks/useStickyHeights";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Zap } from "lucide-react";
import { engineApi, type EngineBundle } from "@/api/engineApi";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useExchange } from "@/hooks/useExchange";
import { useInstruments } from "@/hooks/useInstruments";
import { navigateBack } from "@/lib/navigation";
import { TechnicalsTab } from "@/components/stock/tabs/TechnicalsTab";
import { StockAlertDialog } from "@/components/alerts/StockAlertDialog";
import { EngineForecastDesk, EngineReportsDesk, BriefingDecisionDesk, EvidenceLedger, ValuationSensitivityDesk, OwnershipAuditDesk, TechnicalResearchDesk, ScenarioWorkbench } from "@/components/engine/EngineResearchTools";
import { ValuationPreview } from "@/components/stock/FundamentalResearch";
import { EngineBasic } from "@/components/engine/EngineBasic";
import { ToolHelp } from "@/components/shared/ToolHelp";

const tools = [
  "Briefing",
  "Forecast",
  "News",
  "Earnings & Reports",
  "Valuation",
  "Ownership",
  "Technicals",
  "Scenario lab",
  "Peers",
  "Portfolio",
  "Ask Engine",
  "Monitoring",
  "Preferences",
  "Evidence",
  "Journal",
] as const;
type Tool = (typeof tools)[number];
const groups: { name: string; tools: Tool[] }[] = [
  {
    name: "Company",
    tools: [
      "Briefing",
      "Forecast",
      "News",
      "Earnings & Reports",
      "Valuation",
      "Ownership",
    ],
  },
  {
    name: "Analysis",
    tools: ["Evidence", "Technicals", "Scenario lab", "Peers"],
  },
  {
    name: "My workspace",
    tools: ["Portfolio", "Monitoring", "Journal", "Ask Engine", "Preferences"],
  },
];
const toolHelp: Record<Tool, string> = {
  Forecast: "Explore estimates, growth diagnostics, model research and price sensitivity. Separate evidence from assumptions.",
  Briefing: "Start with the reported facts, then open the supporting evidence or risks that matter to you.",
  News: "Read dated issuer stories and check the original publisher before acting.",
  "Earnings & Reports": "Inspect reported results, cash conversion and statements. Forward estimates are in Forecast.",
  Valuation: "Compare model assumptions, not just the headline value. Missing inputs are shown explicitly.",
  Ownership: "Explore disclosed shareholders. These snapshots are not a record of buying or selling.",
  Evidence: "Review changes, source coverage and gaps before drawing a conclusion.",
  Technicals: "Explore price history and signals, then set an alert for a level you want to follow.",
  "Scenario lab": "Change assumptions to explore outcomes. Scenarios are not forecasts or guarantees.",
  Peers: "Choose a peer and a specific metric to compare on a like-for-like basis.",
  Portfolio: "Review holdings, allocation and observed income together, with coverage limits visible.",
  Monitoring: "Track a research question, inspect check results and review triggered alerts.",
  Journal: "Record your thesis, evidence and next review so you can revisit your decisions.",
  "Ask Engine": "Ask a focused question about the selected company and inspect the evidence in the answer.",
  Preferences: "Set your research focus and notification preferences.",
};
function toolFromParam(value: string | null): Tool {
  if (value === "Focus") return "Forecast";
  if (value === "Earnings & forecasts") return "Earnings & Reports";
  return tools.includes(value as Tool) ? (value as Tool) : "Briefing";
}
const money = (value: number | null | undefined, currency: string) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function Engine() {
  const navigate = useNavigate();
  const stickyRef = useStickyHeights();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { exchange, exchangeMeta } = useExchange();
  const { instruments } = useInstruments();
  const symbol = (
    params.get("symbol") ||
    instruments[0]?.symbol ||
    "KCB"
  ).toUpperCase();
  const [goal, setGoal] = useState("Balanced");
  const tool = toolFromParam(params.get("tool"));
  const rememberedTools = useRef<Record<string, Tool>>({});
  const group = groups.find((item) => item.tools.includes(tool))!;
  useEffect(() => { rememberedTools.current[group.name] = tool; }, [group.name, tool]);
  const setTool = (next: Tool) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("tool", next);
        return updated;
      },
      { replace: true },
    );
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const refreshAnalysis = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: ["continua"],
        refetchType: "active",
      });
    } finally {
      setRefreshing(false);
    }
  };
  const paid = ["premium", "premium_plus"].includes(
    profile?.subscription_plan ?? "",
  );
  const fullEngine = profile?.subscription_plan === "premium_plus";
  const query = useQuery({
    queryKey: ["continua", "engine", user?.id, profile?.subscription_plan, exchange, symbol],
    queryFn: () => engineApi.get(symbol, exchange),
    enabled: fullEngine && !!user && !profileLoading && group.name !== "My workspace",
    staleTime: 60_000,
    retry: engineReadRetry,
    refetchInterval: tool === "News" ? 60_000 : false,
    refetchOnReconnect: true,
  });
  const data = query.data;
  const {
    settings: researchPreferences,
    save: savePreferences,
    query: preferencesQuery,
  } = useEnginePreferences();
  useEffect(() => {
    setGoal(researchPreferences.goal);
  }, [researchPreferences.goal]);
  const lastVisit = useRef("");
  useEffect(() => {
    const key = user?.id + ":" + exchange + ":" + symbol;
    if (
      fullEngine &&
      researchPreferences.learnInterests &&
      lastVisit.current !== key
    ) {
      lastVisit.current = key;
      void engineWorkspaceApi.visit(symbol, exchange).catch(() => {});
    }
  }, [fullEngine, user?.id, exchange, symbol, researchPreferences.learnInterests]);
  return (
    <div
      ref={stickyRef}
      className="page-canvas min-h-screen bg-background pb-24"
    >
      <header
        data-sticky-header
        className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            aria-label="Back"
            onClick={() => navigateBack(navigate, "/")}
            className="p-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Continua Engine</h1>
          <span className="ml-auto text-xs text-muted-foreground">{fullEngine ? 'Premium Plus' : 'Premium'}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4">
        <section className="border-b border-border/70 py-5">
          {paid ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight">
                Your research workspace
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Company evidence. Portfolio insight. Your perspective.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Research, connected
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                A clearer view of your investments.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Understand the company. Examine the evidence. Keep track of what
                matters to you.
              </p>
            </>
          )}
        </section>
        {profileLoading ? (
          <p role="status" className="py-10 text-sm text-muted-foreground">
            Checking membership…
          </p>
        ) : paid && !fullEngine ? <EngineBasic symbol={symbol} exchange={exchange}/> : !paid ? (
          <section className="py-6 space-y-5">
            <h3 className="text-lg font-semibold">
              Full Engine is included with Premium Plus
            </h3>
            <div className="divide-y divide-border/70">
              {[
                [
                  "Fundamental Engine",
                  "Calculated company briefings, earnings, forecasts, model valuations and disclosed shareholders.",
                ],
                [
                  "Technical Engine",
                  "Indicators, daily volume profiles, historical signal backtesting and custom alerts.",
                ],
                [
                  "Scenario lab",
                  "Explore revenue and profit growth assumptions using company filings.",
                ],
              ].map(([title, detail]) => (
                <div key={title} className="py-4">
                  <h4 className="font-semibold">{title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
            <Link
              to="/upgrade"
              className="inline-block rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background"
            >
              Unlock Continua Engine
            </Link>
            <p className="text-xs text-muted-foreground">
              Your free Fundamentals allowance remains available on stock pages.
            </p>
          </section>
        ) : (
          <>
            <section className="flex items-center justify-between gap-3 border-b border-border/70 py-4">
              <label className="text-xs text-muted-foreground">
                Stock · {exchangeMeta.code}
                <select
                  aria-label="Engine stock"
                  value={symbol}
                  onChange={(event) => {
                    const next = new URLSearchParams(params);
                    next.set("symbol", event.target.value);
                    setParams(next);
                  }}
                  className="ml-3 max-w-52 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {[
                    ...new Set([
                      symbol,
                      ...instruments.map((item) => item.symbol),
                    ]),
                  ].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <button
                aria-label="Refresh Engine analysis"
                onClick={() => void refreshAnalysis()}
                disabled={refreshing || query.isFetching}
                className="p-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing || query.isFetching ? "animate-spin" : ""}`}
                />
              </button>
            </section>
            <nav
              data-sticky-nav
              style={{ top: "var(--sticky-header-height, 64px)" }}
              className="sticky z-20 -mx-4 border-b border-border/70 bg-background/95 px-4 backdrop-blur-xl"
              aria-label="Engine navigation"
            >
              <div className="flex gap-6" aria-label="Engine sections">
                {groups.map((item) => (
                  <button
                    key={item.name}
                    aria-pressed={group.name === item.name}
                    onClick={() => setTool(rememberedTools.current[item.name] ?? item.tools[0])}
                    className={`min-h-11 border-b-2 text-sm font-semibold ${group.name === item.name ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <div
                className="flex gap-1 overflow-x-auto py-3 scrollbar-hide"
                role="tablist"
                aria-label="Engine tools"
              >
                {group.tools.map((item) => (
                  <button
                    key={item}
                    role="tab"
                    aria-selected={tool === item}
                    onClick={() => setTool(item)}
                    className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${tool === item ? "bg-foreground font-semibold text-background" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </nav>
            <div className="engine-tool-context" aria-label="Current research tool">
              <p className="font-semibold flex items-center gap-2">{tool}{["Portfolio", "Preferences"].includes(tool) ? "" : ` · ${symbol}`}<ToolHelp tool={tool} description={toolHelp[tool]}/></p>
              <p className="text-sm text-muted-foreground">{toolHelp[tool]}</p>
            </div>
            {group.name === "My workspace" ? null : query.isLoading ? (
              <p role="status" className="py-10 text-sm text-muted-foreground">
                Preparing your analysis…
              </p>
            ) : query.isError ? (
              <div className="py-8 space-y-3">
                <p role="alert" className="text-sm text-muted-foreground">
                  {query.error.message}
                </p>
                <button
                  className="text-sm font-semibold text-primary"
                  onClick={() => void query.refetch()}
                >
                  Retry analysis
                </button>
              </div>
            ) : (
              data && (
                <div key={`${exchange}:${symbol}`} className="py-6 space-y-6">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {symbol} · {exchangeMeta.code}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        {data.companyName}
                      </h2>
                    </div>
                    <div>
                      <p className="text-xl font-semibold tabular-nums">
                        {money(data.quote?.lastPrice, data.currency)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Analysis updated{" "}
                        {new Date(data.generatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  {!!data.unavailable?.length && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Some feeds could not be loaded:{" "}
                      {data.unavailable.join(", ")}. Available analysis is shown
                      below; refresh to retry.
                    </p>
                  )}
                  {tool === "Briefing" && (
                    <>
                      <label className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                        Research focus
                        <select
                          aria-label="Research goal"
                          value={goal}
                          disabled={
                            savePreferences.isPending ||
                            preferencesQuery.isLoading
                          }
                          onChange={(e) => {
                            setGoal(e.target.value);
                            if (preferencesQuery.data)
                              savePreferences.mutate({
                                ...researchPreferences,
                                goal: e.target.value,
                              });
                          }}
                          className="max-w-full rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
                        >
                          {[
                            "Balanced",
                            "Income",
                            "Growth",
                            "Capital preservation",
                            "Short-term trading",
                          ].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      {savePreferences.isError && (
                        <p
                          role="status"
                          className="text-xs text-muted-foreground"
                        >
                          Focus could not sync. Try again in Preferences.
                        </p>
                      )}
                      <div className="flex gap-3 overflow-x-auto border-y border-border/70 py-1 text-sm font-semibold text-primary" aria-label="Briefing next steps">
                        <button className="shrink-0 whitespace-nowrap" onClick={() => setTool("Evidence")}>
                          What changed? →
                        </button>
                        <button className="shrink-0 whitespace-nowrap" onClick={() => setTool("Monitoring")}>
                          Monitor {symbol} →
                        </button>
                        <button className="shrink-0 whitespace-nowrap" onClick={() => setTool("Journal")}>
                          Keep research notes →
                        </button>
                      </div>
                      <Briefing data={data} goal={goal} />
                      <BriefingDecisionDesk key={symbol} data={data}/>
                    </>
                  )}
                  {tool === "Evidence" && (
                    <>
                      <EvidenceLedger key={symbol} data={data}/>
                      {data.quality ? (
                        <EngineInsights data={data} />
                      ) : (
                        <section>
                          <h3 className="text-lg font-semibold">
                            Evidence coverage
                          </h3>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Detailed change comparisons are not available in
                            this response. Coverage:{" "}
                            {data.coverage.annualPeriods} annual periods,{" "}
                            {data.coverage.valuationModels} valuation models and{" "}
                            {data.coverage.analystEstimates} analyst estimates.
                          </p>
                        </section>
                      )}
                      {data.synthesis && (
                        <section className="space-y-3 border-t border-border pt-5">
                          <h3 className="text-lg font-semibold">
                            Connected research summary
                          </h3>
                          {[
                            ...data.synthesis.observations,
                            ...data.synthesis.checklist,
                          ].map((item, index) => (
                            <div key={index}>
                              <p className="text-xs font-semibold">
                                {item.topic}
                                {item.asOf ? ` · ${item.asOf}` : ""}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {item.text}
                              </p>
                            </div>
                          ))}
                          <p className="text-xs text-muted-foreground">
                            {data.synthesis.methodology}
                          </p>
                        </section>
                      )}
                    </>
                  )}
                  {tool === "News" && (
                    <section className="space-y-5">
                      <h3 className="text-lg font-semibold">
                        Company news digest
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Reported developments, with company relevance explained.
                        Open any headline to read that story in Media.
                      </p>
                      {data.news.map((item) => (
                        <article
                          key={item.id}
                          className="border-b border-border/70 pb-4"
                        >
                          <Link
                            to={mediaStoryUrl(item.id)}
                            className="font-semibold text-base leading-snug hover:text-primary"
                          >
                            {item.headline}
                          </Link>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {item.summary}
                          </p>
                          {item.impact && (
                            <p className="mt-2 text-xs">
                              {item.impact.topic}: {item.impact.reason}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.methodology}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.source} ·{" "}
                            {item.publishedAt
                              ? new Date(item.publishedAt).toLocaleDateString()
                              : "Publication date unavailable"}
                          </p>
                        </article>
                      ))}
                      {!data.news.length && (
                        <p className="text-sm text-muted-foreground">
                          No verified company-linked news is available.
                        </p>
                      )}
                    </section>
                  )}
                  {tool === "Forecast" && <EngineForecastDesk key={symbol} symbol={symbol} currency={data.currency}/>}
                  {tool === "Earnings & Reports" && <EngineReportsDesk key={symbol} data={data}/>}
                  {tool === "Valuation" && (
                    <section className="divide-y divide-border/70">
                      <ValuationPreview symbol={symbol} currency={data.currency} name={data.companyName} sector={instruments.find(item=>item.symbol===symbol)?.sector??""} price={Number(data.quote?.lastPrice??0)}/>
                      <ValuationSensitivityDesk key={symbol} data={data}/>
                      {data.valuation?.models.map((model) => (
                        <div key={model.model} className="py-4 space-y-2">
                          <div className="flex justify-between gap-3">
                            <h3 className="text-sm font-semibold">
                              {model.model}
                            </h3>
                            <span className="text-sm font-semibold">
                              {money(model.fairValue, data.currency)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {model.fairValue == null
                              ? model.unavailableReason
                              : `${Number(model.upsidePercent).toFixed(1)}% model-implied upside`}
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {model.methodology}
                          </p>
                        </div>
                      )) ?? (
                        <p className="text-sm text-muted-foreground">
                          No usable valuation inputs yet.
                        </p>
                      )}
                    </section>
                  )}
                  {tool === "Ownership" && <OwnershipAuditDesk key={symbol} data={data}/>}
                  {tool === "Technicals" && (
                    <>
                      <TechnicalsTab symbol={symbol} currency={data.currency} />
                      <TechnicalResearchDesk key={symbol} symbol={symbol}/>
                      <button
                        className="rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background"
                        onClick={() => setAlertsOpen(true)}
                      >
                        Create a custom alert
                      </button>
                    </>
                  )}
                  {tool === "Scenario lab" && <ScenarioWorkbench key={symbol} symbol={symbol} currency={data.currency}/>}
                  <div className="flex gap-4 border-t border-border/70 pt-4 text-xs font-semibold text-primary">
                    <Link to={`/stock/${encodeURIComponent(symbol)}`}>
                      Open stock Fundamentals →
                    </Link>
                    <Link to={`/compare?stock=${encodeURIComponent(symbol)}`}>
                      Compare peers →
                    </Link>
                  </div>
                </div>
              )
            )}
            {[
              "Peers",
              "Portfolio",
              "Ask Engine",
              "Monitoring",
              "Preferences",
              "Journal",
            ].includes(tool) && (
              <div className="py-5">
                {tool === "Journal" && (
                  <ResearchJournal
                    account={user?.id ?? "guest"}
                    exchange={exchange}
                    symbol={symbol}
                  />
                )}
                {tool === "Peers" && (
                  <EnginePeersPanel symbol={symbol} exchange={exchange} />
                )}
                {tool === "Portfolio" && (
                  <EnginePortfolioPanel exchange={exchange} />
                )}
                {tool === "Ask Engine" && (
                  <EngineAssistantPanel
                    key={user?.id + ":" + exchange + ":" + symbol}
                    symbol={symbol}
                    exchange={exchange}
                  />
                )}
                {tool === "Monitoring" && (
                  <EngineMonitoringPanel symbol={symbol} exchange={exchange} />
                )}
                {tool === "Preferences" && <EnginePreferencesPanel />}
              </div>
            )}
          </>
        )}
        {paid && <EngineConnectionCheck target={tool === "Portfolio" ? "portfolio" : tool === "Monitoring" ? "monitoring" : "preferences"} exchange={exchange} />}
      </main>
      {paid && (
        <StockAlertDialog
          open={alertsOpen}
          onOpenChange={setAlertsOpen}
          symbol={symbol}
          currentPrice={data?.quote?.lastPrice ?? 0}
        />
      )}
    </div>
  );
}

function Briefing({ data, goal }: { data: EngineBundle; goal: string }) {
  const priority: Record<string, RegExp> = {
    Income: /dividend|margin|income/i,
    Growth: /revenue|EPS|increased/i,
    "Capital preservation": /debt|loss|margin/i,
    "Short-term trading": /EPS|income/i,
    Balanced: /./,
  };
  const facts = [...data.briefing.facts].sort(
    (a, b) => Number(priority[goal].test(b)) - Number(priority[goal].test(a)),
  );

  return (
    <section className="engine-briefing space-y-3">
      <div className="engine-evidence-summary" aria-label="Research coverage">
        <div><span>Annual periods</span><strong>{data.coverage.annualPeriods}</strong></div>
        <div><span>Valuation models</span><strong>{data.coverage.valuationModels}</strong></div>
        <div><span>Earnings records</span><strong>{data.coverage.earningsEvents}</strong></div>
        <div><span>Analyst estimates</span><strong>{data.coverage.analystEstimates}</strong></div>
      </div>
      <div>
        <h3 className="text-lg font-semibold">Fundamental briefing</h3>
        <p className="mt-1 text-xs text-primary">
          Evidence ordered for your {goal.toLowerCase()} research goal
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.briefing.coverage}
        </p>
        <div className="mt-3 divide-y divide-border/70">
          {facts.map((fact) => (
            <p key={fact} className="py-3 text-sm leading-relaxed">
              {fact}
            </p>
          ))}
        </div>
        {!data.briefing.facts.length && (
          <p className="py-4 text-sm text-muted-foreground">
            There are not enough reported financial inputs for a company
            briefing yet.
          </p>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          ["Supporting evidence", data.briefing.strengths],
          ["Risks to examine", data.briefing.risks],
        ].map(([label, entries]) => (
          <details key={label as string} open>
            <summary>{label as string} · {(entries as string[]).length}</summary>
            {(entries as string[]).length ? (
              (entries as string[]).map((item) => (
                <p className="mt-2 text-sm text-muted-foreground" key={item}>
                  {item}
                </p>
              ))
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No additional signal from the available inputs.
              </p>
            )}
          </details>
        ))}
      </div>
      <details><summary>How this briefing was calculated</summary><p className="mt-1 text-sm text-muted-foreground">{data.briefing.methodology}</p></details>
    </section>
  );
}
