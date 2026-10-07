import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Filter,
  GitCompare,
  Landmark,
  Layers,
  RefreshCw,
} from "lucide-react";
import { TopBar } from "@/components/shared/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AllStocksList } from "@/components/markets/AllStocksList";
import { MarketHeatmap } from "@/components/markets/MarketHeatmap";
import { MarketStatusIndicator } from "@/components/shared/MarketStatusIndicator";
import { ResearchChart } from "@/components/markets/ResearchChart";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useIndices } from "@/hooks/useIndices";
import { usePageState } from "@/hooks/usePageState";
import { useUpcomingDividends } from "@/hooks/useMarketCalendars";
import { CANONICAL_SYMBOLS, STOCK_META } from "@/lib/stockPrices";
import { investmentThemes } from "@/data/investmentThemes";
import { industryChains } from "@/data/industryChains";
import { useWatchlist } from "@/hooks/useWatchlist";
import {
  marketResearchApi,
  type ResearchRecord,
} from "@/api/marketResearchApi";
import { screenerApi } from "@/api/screenerApi";
import { TrendResearch } from "@/components/markets/TrendResearch";
import "./markets.css";

const sections = [
  ["ipos", "IPOs"],
  ["movers", "Market Movers"],
  ["earnings", "Earnings"],
  ["earnings-beat", "Earnings Beat"],
  ["economic", "Economic Calendar"],
  ["themes", "Investment Themes"],
  ["dividends", "Dividend Rankings"],
  ["dividend-calendar", "Dividend Calendar"],
  ["heatmap", "Heat Map"],
  ["trend", "Trend Projection"],
  ["industry", "Industry Chain"],
  ["monitor", "Market Monitor"],
  ["macro", "Macroeconomic Data"],
] as const;
const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
function Change({ value }: { value: number | null | undefined }) {
  return (
    <span
      className={
        value == null
          ? "text-muted-foreground"
          : value < 0
            ? "text-bear"
            : "text-bull"
      }
    >
      {value == null ? "—" : `${value > 0 ? "+" : ""}${fmt(value)}%`}
    </span>
  );
}
function Choices({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="market-choices" role="group">
      {values.map((v) => (
        <button
          key={v}
          aria-pressed={value === v}
          className={`pill-tab ${value === v ? "contrast-active" : ""}`}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="market-empty">{children}</p>;
}
function DownloadReminder({ title, date }: { title: string; date: string }) {
  const download = () => {
    const day = date.slice(0, 10).replaceAll("-", "");
    const escape = (s: string) =>
      s
        .replaceAll("\\", "\\\\")
        .replaceAll("\n", "\\n")
        .replaceAll(",", "\\,")
        .replaceAll(";", "\\;");
    const stamp =
      new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const url = URL.createObjectURL(
      new Blob(
        [
          `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Continua//Markets//EN\r\nBEGIN:VEVENT\r\nUID:${day}-${encodeURIComponent(title)}@continua\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${day}\r\nSUMMARY:${escape(title)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
        ],
        { type: "text/calendar" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "continua-event.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Add ${title} to calendar`}
      onClick={download}
    >
      <CalendarPlus className="h-4 w-4" />
    </Button>
  );
}

export default function Markets() {
  const navigate = useNavigate(),
    { section } = useParams();
  const { isInWatchlist } = useWatchlist();
  const [monitorScope, setMonitorScope] = useState("NSE");
  const [savedTab, setTab] = usePageState<string>("markets:desk-tab", "Overview");
  const tab = ["Overview", "Bonds", "All Stocks"].includes(savedTab)
    ? savedTab
    : "Overview";
  const [search, setSearch] = useState(""),
    [ranking, setRanking] = useState("Top Gainers"),
    [ipoStatus, setIpoStatus] = useState("To be Listed");
  const [divSort, setDivSort] = useState("High Dividend"),
    [earningMetric, setEarningMetric] = useState("EPS"),
    [themeSort, setThemeSort] = useState("Top");
  const [selectedDate, setSelectedDate] = useState(""),
    [week, setWeek] = useState(new Date()),
    [macro, setMacro] = useState("");
  const [earnSort, setEarnSort] = useState({ key: "date", ascending: false });
  const [eventFilter, setEventFilter] = useState("All events");
  const sortEarnings = (key: string) =>
    setEarnSort((previous) => ({
      key,
      ascending: previous.key === key ? !previous.ascending : false,
    }));
  const { quotes } = useLiveQuotes(CANONICAL_SYMBOLS, "NSE"),
    { indices } = useIndices();
  const { dividends, isLoading: divLoading } = useUpcomingDividends("NSE", 200);
  const intelligence = useQuery({
    queryKey: ["continua", "market-intelligence"],
    queryFn: marketResearchApi.intelligence,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const recordsQuery = useQuery({
    queryKey: ["continua", "market-records"],
    queryFn: marketResearchApi.records,
    staleTime: 600_000,
    retry: 1,
  });
  const earningsQuery = useQuery({
    queryKey: ["continua", "market-earnings"],
    queryFn: marketResearchApi.earnings,
    staleTime: 600_000,
    retry: 1,
  });
  const ratios = useQuery({
    queryKey: ["continua", "market-screener"],
    queryFn: () => screenerApi.run({ limit: 200 }),
    staleTime: 300_000,
    retry: 1,
  });
  const records = recordsQuery.data?.records ?? [],
    earnings = earningsQuery.data ?? [];
  const matches = (symbol: string, title: string) =>
    `${symbol} ${title}`.toLowerCase().includes(search.toLowerCase());
  const names = (symbol: string) => STOCK_META[symbol]?.name ?? symbol;
  const ranked = Object.values(quotes)
    .filter((q) => q.lastPrice > 0 && matches(q.symbol, names(q.symbol)))
    .sort((a, b) =>
      ranking === "Most Active"
        ? b.volume - a.volume
        : ranking === "Top Losers"
          ? a.changePercent - b.changePercent
          : b.changePercent - a.changePercent,
    );
  const themes = investmentThemes
    .map((t) => {
      const changes = t.stocks
        .map((s) => quotes[s]?.changePercent)
        .filter((v): v is number => v != null && Number.isFinite(v));
      return {
        ...t,
        change: changes.length
          ? changes.reduce((s, v) => s + v, 0) / changes.length
          : null,
        coverage: changes.length,
      };
    })
    .filter((t) => matches("", t.title))
    .sort((a, b) =>
      themeSort === "A–Z"
        ? a.title.localeCompare(b.title)
        : (b.change ?? -Infinity) - (a.change ?? -Infinity),
    );
  const macroRecords = records.filter(
      (r) =>
        r.kind === "macro" &&
        matches("", r.title + " " + (r.payload.indicator ?? "")),
    ),
    indicators = [
      ...new Set(macroRecords.map((r) => r.payload.indicator ?? r.title)),
    ];
  const activeMacro = indicators.includes(macro) ? macro : indicators[0];
  const macroHistory = macroRecords
    .filter((r) => (r.payload.indicator ?? r.title) === activeMacro)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const dividendRankings = [...(ratios.data ?? [])]
    .filter(
      (r) =>
        r.dividendYield != null &&
        r.dividendYield > 0 &&
        matches(r.symbol, r.companyName),
    )
    .sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0));
  const start = new Date(week);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const localDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const dayMatches = (date: string) =>
    !selectedDate || date.slice(0, 10) === selectedDate;
  const calendar = (
    <div className="market-calendar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          {week.toLocaleDateString("en-KE", { month: "long", year: "numeric" })}
        </strong>
        <div className="flex">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous week"
            onClick={() => {
              const d = new Date(week);
              d.setDate(d.getDate() - 7);
              setWeek(d);
              setSelectedDate("");
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setWeek(new Date());
              setSelectedDate(localDay(new Date()));
            }}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next week"
            onClick={() => {
              const d = new Date(week);
              d.setDate(d.getDate() + 7);
              setWeek(d);
              setSelectedDate("");
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <button
            className={`py-3 rounded-full ${selectedDate === localDay(d) ? "bg-accent text-accent-foreground" : ""}`}
            key={localDay(d)}
            onClick={() => setSelectedDate(localDay(d))}
          >
            <span className="block text-xs text-muted-foreground">
              {d.toLocaleDateString("en-KE", { weekday: "short" })}
            </span>
            {d.getDate()}
          </button>
        ))}
      </div>
      {selectedDate && (
        <Button variant="ghost" onClick={() => setSelectedDate("")}>
          Show all dates
        </Button>
      )}
    </div>
  );
  const source = (r: ResearchRecord) => (
    <a
      className="text-xs text-primary underline"
      target="_blank"
      rel="noopener noreferrer"
      href={r.sourceUrl}
    >
      Official source · {dateLabel(r.observedAt)}
    </a>
  );
  const indexStrip = (
    <div className="market-index-strip">
      {indices.map((i) => (
        <div key={i.code}>
          <p className="text-sm text-muted-foreground">{i.code}</p>
          <p className="text-2xl my-2 tabular-nums">{fmt(i.value)}</p>
          <Change value={i.changePercent} />
          <p className="text-xs text-muted-foreground mt-2">
            {dateLabel(i.timestamp)}
          </p>
        </div>
      ))}
      {!indices.length && (
        <Empty>Published NSE indices are not available yet.</Empty>
      )}
    </div>
  );
  function body(id: string, full = false): ReactNode {
    const limit = full ? 200 : 3;
    if (id === "ipos") {
      const ipos = records.filter(
        (r) =>
          r.kind === "ipo" &&
          matches(r.symbol ?? "", r.title) &&
          r.payload.status === ipoStatus,
      );
      return (
        <>
          {full && (
            <>
              <div className="flex gap-3 mb-4">
                <Button
                  variant="outline"
                  onClick={() => setIpoStatus("Listed")}
                >
                  History
                </Button>
                <Button variant="ghost" onClick={() => navigate("/learn")}>
                  Learn about IPOs
                </Button>
              </div>
              <Choices
                values={["Available", "To be Listed", "Listed"]}
                value={ipoStatus}
                onChange={setIpoStatus}
              />
            </>
          )}
          {ipos.slice(0, limit).map((r) => (
            <div className="market-row block" key={r.id}>
              <h3>{r.title}</h3>
              <dl className="market-definition">
                <dt>Initial price · KES</dt>
                <dd>{fmt(r.payload.price)}</dd>
                <dt>Shares offered</dt>
                <dd>{fmt(r.payload.shares, 0)}</dd>
                <dt>Listing date</dt>
                <dd>
                  {r.payload.date ? dateLabel(r.payload.date) : "Not announced"}
                </dd>
              </dl>
              {source(r)}
            </div>
          ))}
          {!ipos.length && (
            <Empty>
              No verified {ipoStatus.toLowerCase()} NSE IPO announcements on
              file. Rumoured listings are not treated as confirmed offers.
            </Empty>
          )}
        </>
      );
    }
    if (id === "movers")
      return (
        <>
          <Choices
            values={["Top Gainers", "Top Losers", "Most Active"]}
            value={ranking}
            onChange={setRanking}
          />
          <p className="market-note">
            Latest published NSE session · KES. No unsupported pre-market data.
          </p>
          <div className="market-table-scroll">
            <table className="market-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>
                    <button
                      onClick={() =>
                        setRanking(
                          ranking === "Top Gainers"
                            ? "Top Losers"
                            : "Top Gainers",
                        )
                      }
                    >
                      Change ↕
                    </button>
                  </th>
                  <th>Price</th>
                  <th>
                    <button onClick={() => setRanking("Most Active")}>
                      Volume ↓
                    </button>
                  </th>
                  {full && <th>As of</th>}
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, limit).map((q) => (
                  <tr key={q.symbol}>
                    <th>
                      <button onClick={() => navigate(`/stock/${q.symbol}`)}>
                        {q.symbol}
                        <small>{names(q.symbol)}</small>
                      </button>
                    </th>
                    <td>
                      <Change value={q.changePercent} />
                    </td>
                    <td>{fmt(q.lastPrice)}</td>
                    <td>{fmt(q.volume, 0)}</td>
                    {full && <td>{dateLabel(q.timestamp)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ranked.length && <Empty>No quoted stocks match this view.</Empty>}
        </>
      );
    if (id === "earnings" || id === "earnings-beat") {
      const beat = id === "earnings-beat",
        revenue = earningMetric === "Revenue";
      const rows = earnings
        .filter(
          (e) =>
            matches(e.symbol, e.companyName) &&
            (!full ||
              !selectedDate ||
              (e.reportedDate ?? e.expectedDate)?.slice(0, 10) ===
                selectedDate),
        )
        .sort((a, b) => {
          const numberFor = (e: typeof a) => {
            const actual =
              earningMetric === "EBIT"
                ? null
                : revenue
                  ? e.revenueActual
                  : e.epsActual;
            const estimate =
              earningMetric === "EBIT"
                ? null
                : revenue
                  ? e.revenueEstimate
                  : e.epsEstimate;
            if (earnSort.key === "actual") return actual;
            if (earnSort.key === "estimate") return estimate;
            if (earnSort.key === "beat")
              return actual != null && estimate != null && estimate !== 0
                ? ((actual - estimate) / Math.abs(estimate)) * 100
                : null;
            if (earnSort.key === "eps") return e.epsActual;
            if (earnSort.key === "revenue") return e.revenueActual;
            return e.reportedDate || e.expectedDate
              ? Date.parse((e.reportedDate ?? e.expectedDate)!)
              : null;
          };
          const av = numberFor(a),
            bv = numberFor(b);
          if (av == null) return bv == null ? 0 : 1;
          if (bv == null) return -1;
          return (av - bv) * (earnSort.ascending ? 1 : -1);
        });
      return (
        <>
          {full && !beat && calendar}
          {beat && (
            <Choices
              values={["EPS", "Revenue", "EBIT"]}
              value={earningMetric}
              onChange={setEarningMetric}
            />
          )}
          <div className="market-table-scroll">
            <table className="market-table">
              <thead>
                <tr>
                  <th>Company</th>
                  {beat ? (
                    <>
                      <th>
                        <button onClick={() => sortEarnings("beat")}>
                          Beat % ↕
                        </button>
                      </th>
                      <th>
                        <button onClick={() => sortEarnings("actual")}>
                          Actual {earningMetric} ↕
                        </button>
                      </th>
                      <th>
                        <button onClick={() => sortEarnings("estimate")}>
                          Estimate {earningMetric} ↕
                        </button>
                      </th>
                      <th>After earnings</th>
                    </>
                  ) : (
                    <>
                      <th>
                        <button onClick={() => sortEarnings("eps")}>
                          Actual EPS · KES ↕
                        </button>
                      </th>
                      <th>
                        <button onClick={() => sortEarnings("revenue")}>
                          Revenue · KES ↕
                        </button>
                      </th>
                    </>
                  )}
                  <th>
                    <button onClick={() => sortEarnings("date")}>
                      Report date ↕
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((e) => {
                  const actual =
                      earningMetric === "EBIT"
                        ? null
                        : revenue
                          ? e.revenueActual
                          : e.epsActual,
                    estimate =
                      earningMetric === "EBIT"
                        ? null
                        : revenue
                          ? e.revenueEstimate
                          : e.epsEstimate;
                  const percent =
                    actual != null && estimate != null && estimate !== 0
                      ? ((actual - estimate) / Math.abs(estimate)) * 100
                      : null;
                  return (
                    <tr key={e.id}>
                      <th>
                        <button onClick={() => navigate(`/stock/${e.symbol}`)}>
                          {e.symbol}
                          <small>
                            {e.companyName} · {e.fiscalYear}
                            {e.fiscalQuarter ? ` Q${e.fiscalQuarter}` : ""}
                          </small>
                        </button>
                      </th>
                      {beat ? (
                        <>
                          <td>
                            <Change value={percent} />
                          </td>
                          <td>{fmt(actual)}</td>
                          <td>{fmt(estimate)}</td>
                          <td>—</td>
                        </>
                      ) : (
                        <>
                          <td>{fmt(e.epsActual)}</td>
                          <td>{fmt(e.revenueActual, 0)}</td>
                        </>
                      )}
                      <td>
                        {e.reportedDate
                          ? dateLabel(e.reportedDate)
                          : e.expectedDate
                            ? `Expected ${dateLabel(e.expectedDate)}`
                            : "Not announced"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <Empty>No verified earnings records match this view.</Empty>
          )}
          {beat && (
            <p className="market-note">
              Beat = (actual − estimate) / |estimate|. Unavailable estimates,
              EBIT and post-release returns are left blank; current quote
              changes are not earnings reactions.
            </p>
          )}
        </>
      );
    }
    if (id === "economic" || id === "dividend-calendar") {
      const economic = id === "economic";
      const events = economic
        ? records
            .filter(
              (r) =>
                r.kind === "economic" &&
                (eventFilter === "All events" || r.payload.importance === 3) &&
                matches("", r.title) &&
                dayMatches(r.payload.date ?? r.observedAt),
            )
            .sort((a, b) =>
              (a.payload.date ?? a.observedAt).localeCompare(
                b.payload.date ?? b.observedAt,
              ),
            )
        : [];
      const divs = dividends.filter(
        (d) =>
          matches(d.symbol, d.companyName) &&
          dayMatches(d.exDate ?? d.payDate ?? ""),
      );
      return (
        <>
          {full && calendar}
          {full && economic && (
            <Choices
              values={["All events", "High importance"]}
              value={eventFilter}
              onChange={setEventFilter}
            />
          )}
          {economic
            ? events.slice(0, limit).map((r) => (
                <div className="market-row" key={r.id}>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {dateLabel(r.payload.date ?? r.observedAt)} · Kenya
                    </p>
                    <h3>{r.title}</h3>
                    <p className="market-note">
                      Previous {fmt(r.payload.previous)} · Consensus{" "}
                      {fmt(r.payload.consensus)} · Actual{" "}
                      {fmt(r.payload.actual)} {r.payload.unit}
                    </p>
                    {source(r)}
                  </div>
                  <DownloadReminder
                    title={r.title}
                    date={r.payload.date ?? r.observedAt}
                  />
                </div>
              ))
            : divs.slice(0, limit).map((d) => (
                <div className="market-row" key={d.id}>
                  <button
                    className="text-left"
                    onClick={() => navigate(`/stock/${d.symbol}`)}
                  >
                    <strong>{d.symbol}</strong>
                    <small>{d.companyName}</small>
                    <p className="market-note">
                      KES{" "}
                      {fmt(
                        (d.details as { amountPerShare?: number })
                          .amountPerShare,
                      )}{" "}
                      per share · Ex-date{" "}
                      {d.exDate ? dateLabel(d.exDate) : "Not announced"}
                      {d.payDate ? ` · Payment ${dateLabel(d.payDate)}` : ""}
                    </p>
                  </button>
                  {d.exDate && (
                    <DownloadReminder
                      title={`${d.symbol} dividend ex-date`}
                      date={d.exDate}
                    />
                  )}
                </div>
              ))}
          {(economic ? !events.length : !divs.length) && (
            <Empty>
              {!economic && divLoading
                ? "Loading dividend announcements…"
                : "No verified events for the selected dates."}
            </Empty>
          )}
        </>
      );
    }
    if (id === "industry")
      return (
        <>
          <p className="market-note">
            Explore economic exposure from inputs to end users. These links
            describe industry roles, not verified supplier contracts.
          </p>
          {industryChains
            .filter((c) => matches("", c.title))
            .slice(0, full ? 200 : 2)
            .map((chain) => (
              <details key={chain.title} className="border-b py-5" open={full}>
                <summary className="cursor-pointer text-lg">
                  {chain.title}
                </summary>
                <p className="market-note">{chain.description}</p>
                <div className="flex gap-6 overflow-x-auto py-3">
                  {chain.stages.map((stage) => (
                    <div
                      key={stage.name}
                      className="min-w-36 border-l-2 border-primary/25 pl-3"
                    >
                      <p className="text-xs text-muted-foreground mb-3">
                        {stage.name}
                      </p>
                      {stage.symbols
                        .filter((s) => CANONICAL_SYMBOLS.includes(s))
                        .map((symbol) => (
                          <button
                            className="block text-left py-2 w-full"
                            key={symbol}
                            onClick={() => navigate(`/stock/${symbol}`)}
                          >
                            {symbol}
                            <small>{names(symbol)}</small>
                            <Change value={quotes[symbol]?.changePercent} />
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              </details>
            ))}
        </>
      );
    if (id === "themes")
      return (
        <>
          {full && (
            <Choices
              values={["Top", "A–Z"]}
              value={themeSort}
              onChange={setThemeSort}
            />
          )}
          <div className={id === "themes" ? "market-theme-grid" : ""}>
            {themes.slice(0, full ? 200 : 2).map((t) => (
              <button
                className="market-theme"
                key={t.slug}
                onClick={() => navigate(`/theme/${t.slug}`)}
              >
                <span aria-hidden="true" className="market-theme-symbol">
                  {t.icon}
                </span>
                <div>
                  <h3>{t.title}</h3>
                  <p className="text-sm text-muted-foreground">{t.desc}</p>
                  <div className="mt-3">
                    <Change value={t.change} />
                    <span className="market-note">
                      {" "}
                      · {t.coverage}/{t.stocks.length} quoted
                    </span>
                  </div>
                  <p className="text-xs text-primary mt-2">
                    {t.stocks.join(" → ")}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            ))}
          </div>
          <p className="market-note">
            Curated exposure groups, not contractual supplier relationships.
            Returns are equal-weight averages of covered members.
          </p>
        </>
      );
    if (id === "dividends")
      return (
        <>
          <Choices
            values={["High Dividend", "Continuous Growth"]}
            value={divSort}
            onChange={setDivSort}
          />
          {divSort === "Continuous Growth" ? (
            <Empty>
              Consecutive dividend-growth years require a complete annual
              distribution history. Incomplete records are not labelled as a
              growth streak.
            </Empty>
          ) : (
            <div className="market-table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Dividend yield ↓</th>
                    <th>Price · KES</th>
                    <th>P/E</th>
                  </tr>
                </thead>
                <tbody>
                  {dividendRankings.slice(0, limit).map((r, i) => (
                    <tr key={r.symbol}>
                      <th>
                        <button onClick={() => navigate(`/stock/${r.symbol}`)}>
                          {i + 1}. {r.symbol}
                          <small>{r.companyName}</small>
                        </button>
                      </th>
                      <td>{fmt(r.dividendYield! * 100)}%</td>
                      <td>{fmt(r.lastPrice)}</td>
                      <td>{fmt(r.pe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dividendRankings.length && (
                <Empty>No computed dividend yields available.</Empty>
              )}
            </div>
          )}
          <p className="market-note">
            Engine-computed ratios; coverage follows available financial
            statements. Yield is not a guaranteed return.
          </p>
        </>
      );
    if (id === "heatmap")
      return (
        <MarketHeatmap
          sectors={intelligence.data?.sectors ?? []}
          quotes={Object.values(quotes)}
          compact={!full}
        />
      );
    if (id === "trend") return <TrendResearch compact={!full} />;
    if (id === "monitor")
      return (
        <>
          <Choices
            values={["NSE", "Watchlist"]}
            value={monitorScope}
            onChange={setMonitorScope}
          />
          <p className="market-note">
            Engine snapshot monitor · movements, not inferred block trades.
          </p>
          {intelligence.data?.monitor
            .filter(
              (r) =>
                matches(r.symbol, names(r.symbol)) &&
                (monitorScope === "NSE" || isInWatchlist(r.symbol)),
            )
            .slice(0, limit)
            .map((r) => (
              <div className="market-monitor-row" key={r.symbol}>
                <time>{dateLabel(r.timestamp)}</time>
                <button onClick={() => navigate(`/stock/${r.symbol}`)}>
                  <strong>{r.symbol}</strong>
                  <small>{names(r.symbol)}</small>
                </button>
                <div className="text-right">
                  <p>{r.signal}</p>
                  <Change value={r.changePercent} />
                  <small>{fmt(r.volume, 0)} shares</small>
                </div>
              </div>
            ))}
          {!intelligence.data?.monitor.filter(
            (r) => monitorScope === "NSE" || isInWatchlist(r.symbol),
          ).length && (
            <Empty>
              Market signals will appear when published quotes are available.
            </Empty>
          )}
        </>
      );
    if (id === "macro")
      return (
        <>
          {indicators.length > 0 && (
            <Choices
              values={indicators}
              value={activeMacro ?? ""}
              onChange={setMacro}
            />
          )}
          <div className="flex flex-wrap justify-between gap-3 my-4">
            {["actual", "consensus", "previous"].map((k) => (
              <div key={k}>
                <small className="capitalize text-muted-foreground">{k}</small>
                <p className="text-xl">
                  {fmt(macroHistory.at(-1)?.payload[k as "actual"])}{" "}
                  {macroHistory.at(-1)?.payload.unit}
                </p>
              </div>
            ))}
          </div>
          <ResearchChart
            data={macroHistory.map((r) => ({
              date: r.observedAt.slice(0, 10),
              actual: r.payload.actual,
              consensus: r.payload.consensus,
            }))}
            lines={[
              {
                key: "actual",
                label: activeMacro ?? "Actual",
                color: "hsl(var(--primary))",
              },
              {
                key: "consensus",
                label: "Consensus",
                color: "#0d9488",
                dashed: true,
              },
            ]}
          />
          {macroHistory.at(-1) && source(macroHistory.at(-1)!)}
          {!macroHistory.length && (
            <Empty>
              Verified KNBS/CBK indicator history is not loaded yet. No
              synthetic macro series is displayed.
            </Empty>
          )}
        </>
      );
    return null;
  }
  const title = sections.find(([id]) => id === section)?.[1];
  return (
    <div className="page-canvas market-desk pb-24">
      {section ? (
        <header className="market-detail-header">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to markets"
            onClick={() => navigate("/markets")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1>{title ?? "Markets"}</h1>
        </header>
      ) : (
        <>
          <TopBar
            title="Markets"
            subtitle="Kenya · research that connects"
            showSearch
            showNotifications
            onSearch={(q) => {
              setSearch(q);
              if (q.trim()) setTab("All Stocks");
            }}
          />
          <div className="sub-nav">
            <Choices
              values={["Overview", "Bonds", "Watch List", "Heat Map", "Calendar", "All Stocks"]}
              value={tab}
              onChange={(value) => {
                const routes: Record<string, string> = { "Watch List": "/watchlist", "Heat Map": "/markets/heatmap", Calendar: "/markets/economic" };
                if (routes[value]) navigate(routes[value]);
                else setTab(value);
              }}
            />
          </div>
        </>
      )}
      <main className="px-4 md:px-8">
        {section ? (
          <>
            <div className="my-5">
              <Input
                aria-label={`Search ${title}`}
                placeholder={`Search ${title?.toLowerCase() ?? "markets"}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {title ? (
              body(section, true)
            ) : (
              <Empty>This research view does not exist.</Empty>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between items-center py-1">
              <MarketStatusIndicator />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh market research"
                onClick={() => {
                  void intelligence.refetch();
                  void recordsQuery.refetch();
                  void earningsQuery.refetch();
                  void ratios.refetch();
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="market-tool-rail">
              <Button variant="outline" onClick={() => navigate("/screener")}>
                <Filter className="h-4 w-4 mr-2" />
                Screener
              </Button>
              <Button variant="outline" onClick={() => navigate("/compare")}>
                <GitCompare className="h-4 w-4 mr-2" />
                Compare
              </Button>
            </div>
            {tab === "All Stocks" ? (
              <AllStocksList search={search} />
            ) : tab === "Bonds" ? (
              <Bonds
                records={records.filter((r) => r.kind === "bond")}
                source={source}
              />
            ) : (
              <>
                {indexStrip}
                {sections
                    .filter(([id]) => id !== "dividend-calendar")
                    .map(([id, label]) => (
                      <section className="market-section" key={id}>
                        <button
                          className="market-section-heading"
                          onClick={() => navigate(`/markets/${id}`)}
                        >
                          <h2>{label}</h2>
                          <ChevronRight className="h-5 w-5" />
                        </button>
                        {body(id)}
                        {id === "dividends" && (
                          <Button
                            variant="ghost"
                            className="mt-3"
                            onClick={() =>
                              navigate("/markets/dividend-calendar")
                            }
                          >
                            Dividend Calendar{" "}
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        )}
                      </section>
                    ))}
                {
                  <>
                    <section className="market-section">
                      <h2 className="mb-2">Market breadth</h2>
                      <div className="market-breadth">
                        {intelligence.data?.distribution.map((d, i) => (
                          <div key={d.label}>
                            <strong>{d.count}</strong>
                            <div
                              style={{
                                height: Math.max(
                                  2,
                                  (d.count /
                                    (Math.max(
                                      ...intelligence.data!.distribution.map(
                                        (d) => d.count,
                                      ),
                                    ) || 1)) *
                                    110,
                                ),
                                background:
                                  i < 4
                                    ? "hsl(var(--bear))"
                                    : i === 4
                                      ? "hsl(var(--muted-foreground))"
                                      : "hsl(var(--bull))",
                              }}
                            />
                            <small>{d.label}</small>
                          </div>
                        ))}
                      </div>
                      <p className="market-note">
                        {intelligence.data?.coverage ?? 0} covered issuers ·{" "}
                        {intelligence.data?.advancing ?? 0} advancing ·{" "}
                        {intelligence.data?.declining ?? 0} declining
                      </p>
                      <p className="market-note">
                        {intelligence.data?.methodology}
                      </p>
                    </section>
                    <section className="market-section">
                      <h2>Kenyan sectors</h2>
                      {intelligence.data?.sectors.map((s) => (
                        <button
                          key={s.name}
                          className="market-row w-full text-left"
                          onClick={() =>
                            navigate(`/sector/${encodeURIComponent(s.name)}`)
                          }
                        >
                          <span>
                            {s.name}
                            <small>{s.coverage} quoted issuers</small>
                          </span>
                          <Change value={s.changePercent} />
                        </button>
                      ))}
                    </section>
                  </>
                }
              </>
            )}
          </>
        )}
        {(intelligence.isError ||
          recordsQuery.isError ||
          earningsQuery.isError ||
          ratios.isError) && (
          <div className="market-error" role="status">
            Some market research could not load. Existing quotes remain
            available.{" "}
            <Button
              variant="ghost"
              onClick={() => {
                void intelligence.refetch();
                void recordsQuery.refetch();
                void earningsQuery.refetch();
                void ratios.refetch();
              }}
            >
              Retry research
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function Bonds({
  records,
  source,
}: {
  records: ResearchRecord[];
  source: (r: ResearchRecord) => ReactNode;
}) {
  const [view, setView] = useState("Yield Curve");
  const latest = useMemo(() => {
    const map = new Map<string, ResearchRecord>();
    for (const r of [...records].sort((a, b) =>
      b.observedAt.localeCompare(a.observedAt),
    ))
      if (!map.has(r.title)) map.set(r.title, r);
    return [...map.values()];
  }, [records]);
  return (
    <section className="market-section">
      <h2 className="flex gap-2 items-center">
        <Landmark className="h-5 w-5" />
        Kenyan government debt
      </h2>
      <p className="market-note">
        CBK auction results · KES · coupon and auction yield are different
        measures.
      </p>
      <Choices
        values={["Yield Curve", "Treasury Bonds", "Treasury Bills"]}
        value={view}
        onChange={setView}
      />
      {view === "Yield Curve" ? (
        <ResearchChart
          data={latest
            .filter((r) => r.payload.tenor != null && r.payload.yield != null)
            .sort((a, b) => a.payload.tenor! - b.payload.tenor!)
            .map((r) => ({
              date: `${r.payload.tenor}y`,
              yield: r.payload.yield,
            }))}
          lines={[
            {
              key: "yield",
              label: "Published auction yield (%)",
              color: "hsl(var(--primary))",
            },
          ]}
        />
      ) : (
        <div className="market-table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Yield %</th>
                <th>Coupon %</th>
                <th>Maturity</th>
                <th>Source / auction date</th>
              </tr>
            </thead>
            <tbody>
              {latest
                .filter((r) =>
                  view === "Treasury Bills"
                    ? (r.payload.tenor ?? Infinity) <= 1
                    : (r.payload.tenor ?? 0) > 1,
                )
                .map((r) => (
                  <tr key={r.id}>
                    <th>{r.title}</th>
                    <td>{fmt(r.payload.yield)}</td>
                    <td>{fmt(r.payload.coupon)}</td>
                    <td>
                      {r.payload.maturity ? dateLabel(r.payload.maturity) : "—"}
                    </td>
                    <td>{source(r)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {!latest.length && (
        <Empty>
          Verified CBK auction observations are not loaded yet. No foreign
          bonds, ETFs or invented yields.
        </Empty>
      )}
      <a
        className="text-sm underline text-primary"
        target="_blank"
        rel="noopener noreferrer"
        href="https://www.centralbank.go.ke/bills-bonds/treasury-bonds/"
      >
        CBK official auction notices and results
      </a>
      <p className="market-note">
        Different auction dates are not a same-day secondary-market yield curve.
        Check each observation's source date before comparing.
      </p>
    </section>
  );
}
