import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Save, SlidersHorizontal, X } from "lucide-react";
import { screenerApi } from "@/api/screenerApi";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { CANONICAL_SYMBOLS, STOCK_META } from "@/lib/stockPrices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./markets.css";

type Filters = {
  sector: string;
  minPrice: string;
  maxPrice: string;
  minChange: string;
  maxChange: string;
  minYield: string;
  maxPe: string;
  minCap: string;
  minVolume: string;
  minRoe: string;
  minMargin: string;
  maxDebt: string;
  maxPb: string;
};
const empty: Filters = {
  sector: "All",
  minPrice: "",
  maxPrice: "",
  minChange: "",
  maxChange: "",
  minYield: "",
  maxPe: "",
  minCap: "",
  minVolume: "",
  minRoe: "",
  minMargin: "",
  maxDebt: "",
  maxPb: "",
};
type Saved = { name: string; filters: Filters };
function readSaved(): Saved[] {
  try {
    const data = JSON.parse(
      localStorage.getItem("continua:screeners:v1") ?? "[]",
    );
    return Array.isArray(data)
      ? data
          .filter(
            (s) =>
              typeof s?.name === "string" &&
              s.filters &&
              Object.keys(empty).every((k) => typeof s.filters[k] === "string"),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function StockScreener() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>({ ...empty }),
    [category, setCategory] = useState("Market"),
    [search, setSearch] = useState(""),
    [name, setName] = useState(""),
    [saved, setSaved] = useState(readSaved),
    [sort, setSort] = useState("change"),
    [ascending, setAscending] = useState(false);
  const { quotes } = useLiveQuotes(CANONICAL_SYMBOLS, "NSE");
  const research = useQuery({
    queryKey: ["continua", "market-screener"],
    queryFn: () => screenerApi.run({ limit: 200 }),
    staleTime: 300_000,
    retry: 1,
  });
  const rows = useMemo(() => {
    const lookup = new Map((research.data ?? []).map((r) => [r.symbol, r]));
    return CANONICAL_SYMBOLS.map((symbol) => {
      const q = quotes[symbol],
        r = lookup.get(symbol);
      return {
        symbol,
        name: STOCK_META[symbol].name,
        sector: STOCK_META[symbol].sector,
        price: q?.lastPrice ?? null,
        change: q?.changePercent ?? null,
        volume: q?.volume ?? null,
        cap: q?.marketCap ?? r?.marketCap ?? null,
        pe: r?.pe ?? null,
        yield: r?.dividendYield == null ? null : r.dividendYield * 100,
        score: r?.afriScore ?? null,
        roe: r?.roe == null ? null : r.roe * 100,
        margin: r?.netMargin == null ? null : r.netMargin * 100,
        debt: r?.debtToEquity ?? null,
        pb: r?.pb ?? null,
      };
    });
  }, [quotes, research.data]);
  const result = rows
    .filter((r) => {
      if (filters.sector !== "All" && r.sector !== filters.sector) return false;
      if (!`${r.symbol} ${r.name}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      const bounds: [keyof Filters, number | null, boolean, number][] = [
        ["minPrice", r.price, true, 1],
        ["maxPrice", r.price, false, 1],
        ["minChange", r.change, true, 1],
        ["maxChange", r.change, false, 1],
        ["minYield", r.yield, true, 1],
        ["maxPe", r.pe, false, 1],
        ["minCap", r.cap, true, 1e9],
        ["minVolume", r.volume, true, 1],
        ["minRoe", r.roe, true, 1],
        ["minMargin", r.margin, true, 1],
        ["maxDebt", r.debt, false, 1],
        ["maxPb", r.pb, false, 1],
      ];
      return bounds.every(
        ([key, value, min, scale]) =>
          filters[key] === "" ||
          (Number.isFinite(Number(filters[key])) &&
            value != null &&
            (key !== "maxPe" || value > 0) &&
            (min
              ? value >= Number(filters[key]) * scale
              : value <= Number(filters[key]) * scale)),
      );
    })
    .sort((a, b) => {
      const av = a[sort as "change"],
        bv = b[sort as "change"];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return (av - bv) * (ascending ? 1 : -1);
    });
  const change = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const number = (value: number | null) =>
    value == null
      ? "—"
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const exportCsv = () => {
    const csv = [
      "Symbol,Company,Price KES,Change %,Volume,Market cap KES,PE,Dividend yield %,Engine score",
      ...result.map((r) =>
        [
          r.symbol,
          `"${r.name.replaceAll('"', '""')}"`,
          r.price ?? "",
          r.change ?? "",
          r.volume ?? "",
          r.cap ?? "",
          r.pe ?? "",
          r.yield ?? "",
          r.score ?? "",
        ].join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "continua-screen.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fields: Record<string, [keyof Filters, string][]> = {
    Market: [
      ["minPrice", "Min price · KES"],
      ["maxPrice", "Max price · KES"],
      ["minChange", "Min change · %"],
      ["maxChange", "Max change · %"],
    ],
    Valuation: [
      ["maxPe", "Maximum positive P/E"],
      ["minCap", "Min market cap · KES billions"],
      ["maxPb", "Maximum P/B"],
    ],
    Income: [["minYield", "Min dividend yield · %"]],
    Activity: [["minVolume", "Minimum volume · shares"]],
    Profitability: [
      ["minRoe", "Minimum ROE · %"],
      ["minMargin", "Minimum net margin · %"],
    ],
    Health: [["maxDebt", "Maximum debt / equity"]],
  };
  return (
    <div className="page-canvas market-desk pb-24">
      <header className="market-detail-header">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to markets"
          onClick={() => navigate("/markets")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1>Stock Screener</h1>
      </header>
      <main className="px-4 py-6 space-y-5">
        <div>
          <p className="section-eyebrow">NSE research lab</p>
          <h2 className="mt-2">Find your own shortlist.</h2>
          <p className="market-note">
            Combine market, valuation, income and activity criteria. Missing
            metrics never qualify for an active numeric filter.
          </p>
        </div>
        <div className="market-tool-rail">
          {[
            ["Gainers", { minChange: "0.01" }],
            ["Income", { minYield: "5" }],
            ["Value", { maxPe: "10" }],
            ["Banking", { sector: "Banking" }],
          ].map(([label, preset]) => (
            <Button
              key={label as string}
              variant="outline"
              onClick={() =>
                setFilters({ ...empty, ...(preset as Partial<Filters>) })
              }
            >
              {label as string}
            </Button>
          ))}
        </div>
        <Input
          aria-label="Search screener"
          placeholder="Company or symbol…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="border-y py-4">
          <div className="flex justify-between items-center">
            <h3 className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filter builder
            </h3>
            <Button variant="ghost" onClick={() => setFilters({ ...empty })}>
              Reset
            </Button>
          </div>
          <div className="market-choices">
            {Object.keys(fields).map((c) => (
              <button
                key={c}
                className={`pill-tab ${c === category ? "contrast-active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="block text-xs mb-4">
            Sector
            <select
              aria-label="Sector"
              className="block w-full bg-background border rounded-full p-3 mt-2"
              value={filters.sector}
              onChange={(e) => change("sector", e.target.value)}
            >
              {["All", ...new Set(rows.map((r) => r.sector))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            {fields[category].map(([key, label]) => (
              <label className="text-xs" key={key}>
                {label}
                <Input
                  type="number"
                  min={key.toLowerCase().includes("change") ? undefined : 0}
                  step="any"
                  aria-label={label}
                  className="mt-2"
                  value={filters[key]}
                  onChange={(e) => change(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters)
            .filter(([k, v]) => (k === "sector" ? v !== "All" : v !== ""))
            .map(([k, v]) => (
              <Button
                key={k}
                variant="outline"
                size="sm"
                onClick={() =>
                  change(k as keyof Filters, k === "sector" ? "All" : "")
                }
              >
                {k}: {v}
                <X className="ml-2 h-3 w-3" />
              </Button>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="flex-1 min-w-40"
            aria-label="Screen name"
            placeholder="Name this screen"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!name.trim()}
            onClick={() => {
              const next = [
                { name: name.trim(), filters: { ...filters } },
                ...saved.filter((s) => s.name !== name.trim()),
              ].slice(0, 20);
              try {
                localStorage.setItem(
                  "continua:screeners:v1",
                  JSON.stringify(next),
                );
                setSaved(next);
                setName("");
              } catch {
                /* Storage unavailable: do not claim saved. */
              }
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button variant="ghost" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
        {!!saved.length && (
          <div>
            <p className="market-note">Saved on this device</p>
            <div className="flex flex-wrap gap-2">
              {saved.map((s) => (
                <div key={s.name} className="flex">
                  <Button
                    variant="outline"
                    onClick={() => setFilters({ ...s.filters })}
                  >
                    {s.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete saved screen ${s.name}`}
                    onClick={() => {
                      const next = saved.filter((x) => x.name !== s.name);
                      try {
                        localStorage.setItem(
                          "continua:screeners:v1",
                          JSON.stringify(next),
                        );
                        setSaved(next);
                      } catch {}
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-between">
          <h3>{result.length} matching stocks</h3>
          <Button variant="ghost" onClick={() => navigate("/compare")}>
            Compare →
          </Button>
        </div>
        <div className="market-table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Company</th>
                {[
                  ["price", "Price · KES"],
                  ["change", "Change %"],
                  ["volume", "Volume"],
                  ["cap", "Market cap"],
                  ["pe", "P/E"],
                  ["yield", "Yield %"],
                  ["score", "Engine score"],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button
                      onClick={() => {
                        setSort(key);
                        setAscending(sort === key ? !ascending : false);
                      }}
                    >
                      {label} {sort === key ? (ascending ? "↑" : "↓") : "↕"}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.map((r) => (
                <tr key={r.symbol}>
                  <th>
                    <button onClick={() => navigate(`/stock/${r.symbol}`)}>
                      {r.symbol}
                      <small>{r.name}</small>
                    </button>
                  </th>
                  <td>{number(r.price)}</td>
                  <td
                    className={
                      r.change != null && r.change < 0
                        ? "text-bear"
                        : "text-bull"
                    }
                  >
                    {number(r.change)}
                  </td>
                  <td>{number(r.volume)}</td>
                  <td>{number(r.cap)}</td>
                  <td>{number(r.pe)}</td>
                  <td>{number(r.yield)}</td>
                  <td>{number(r.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!result.length && (
          <p className="market-empty">
            No matches. Widen or reset the filters.
          </p>
        )}
        {research.isError && (
          <p className="market-error">
            Research ratios could not load.{" "}
            <Button variant="ghost" onClick={() => void research.refetch()}>
              Retry ratios
            </Button>
          </p>
        )}
      </main>
    </div>
  );
}
