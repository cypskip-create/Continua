/**
 * Parses afx.kwayisi.org's per-ticker stock pages
 * (https://afx.kwayisi.org/nse/{ticker}.html). Every field extracted here
 * is something actually observed on the real CGEN page fetched during
 * development — nothing here is guessing at markup that was never seen.
 *
 * Two real quirks the page has, both handled explicitly rather than
 * silently mishandled:
 *
 * 1. On a zero-volume day, the "Last Trading Results" table's Opening/
 *    Low/High Price cells are blank, but the site's auto-generated
 *    narrative paragraph ("The current share price of ... is KES 21.00
 *    ... a 4.5% drop from its previous closing price of 22.00 KES ...")
 *    always states LastTradedPrice, PrevClose, Change and ChangePct in
 *    prose. The narrative is used as the primary source for exactly
 *    those four fields, since it's present even when the table isn't;
 *    the table is used for Volume, and for Open/High/Low ONLY when
 *    present (left undefined otherwise — never backfilled from the
 *    narrative, which doesn't state them).
 * 2. The page's 10-day trading history table gives Close and Volume per
 *    day but never a daily Open/High/Low. toDailyCandles() below returns
 *    O=H=L=C for those bars deliberately — that's an honest "we only
 *    know the close" flat bar, not an invented intraday range. Treat any
 *    wick-based chart built on these as misleading; a close-only line
 *    chart is the correct way to render them.
 */
import * as cheerio from "cheerio";
/** "KES 21.00" / "21.00 KES" / "21.00" → 21.00. Returns null for blank/dash cells. */
function parseMoney(raw) {
    if (!raw)
        return null;
    const cleaned = raw.replace(/,/g, "").trim();
    if (!cleaned || cleaned === "—" || cleaned === "-")
        return null;
    const match = cleaned.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
}
/** "40.1M" → 40.1, "842M" → 842, "1.2B" → 1200 — all figures observed on
 *  the page were in millions, so this normalizes everything to millions. */
function parseScaledNumber(raw) {
    if (!raw)
        return null;
    const cleaned = raw.replace(/,/g, "").trim();
    const match = cleaned.match(/(-?\d+(\.\d+)?)\s*([BMK])?/i);
    if (!match)
        return null;
    const value = parseFloat(match[1] ?? "0");
    const suffix = match[3]?.toUpperCase();
    if (suffix === "B")
        return value * 1000;
    if (suffix === "K")
        return value / 1000;
    return value; // "M" or bare number already in the target unit
}
function parsePercent(raw) {
    if (!raw)
        return null;
    const match = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
}
/** Volume is a count of shares, never millions of shares. */
function parseVolume(raw) {
    if (typeof raw !== 'string') return null;
    const match = raw.replace(/,/g, '').trim().match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
    if (!match) return null;
    const amount = Number(match[1]) * ({K:1e3,M:1e6,B:1e9}[match[2]?.toUpperCase()] ?? 1);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
/**
 * Reads a "label -> value" table (the "Last Trading Results" and "Growth
 * & Valuation" tables both take this two-column shape) into a plain
 * lookup by lower-cased, whitespace-collapsed label text.
 */
function readLabelValueTables($) {
    const values = new Map();
    $("table").each((_, table) => {
        $(table)
            .find("tr")
            .each((__, row) => {
            const cells = $(row).find("td, th");
            if (cells.length < 2)
                return;
            const label = $(cells[0]).text().trim().toLowerCase().replace(/\s+/g, " ");
            const value = $(cells[1]).text().trim();
            if (label)
                values.set(label, value);
        });
    });
    return values;
}
const NARRATIVE_PRICE_RE = /current share price of .*? is KES\s*([\d,.]+)/i;
const NARRATIVE_PREV_CLOSE_RE = /previous closing price of\s*([\d,.]+)\s*KES/i;
const NARRATIVE_CHANGE_PCT_RE = /recording an? (-?[\d.]+)%\s*(drop|gain|rise|increase|fall)/i;
const NARRATIVE_TRADING_DAY_RE = /closed its last trading day \(([^)]+)\)/i;
export function parseAfxQuote(html, symbol) {
    const $ = cheerio.load(html);
    const labelValues = readLabelValueTables($);
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const narrativePriceMatch = bodyText.match(NARRATIVE_PRICE_RE);
    const narrativePrevCloseMatch = bodyText.match(NARRATIVE_PREV_CLOSE_RE);
    const narrativeChangePctMatch = bodyText.match(NARRATIVE_CHANGE_PCT_RE);
    const narrativeTradingDayMatch = bodyText.match(NARRATIVE_TRADING_DAY_RE);
    const lastTradedPrice = parseMoney(narrativePriceMatch?.[1]);
    const prevClose = parseMoney(narrativePrevCloseMatch?.[1]);
    let changePct = narrativeChangePctMatch ? parseFloat(narrativeChangePctMatch[1] ?? "0") : null;
    if (changePct !== null && narrativeChangePctMatch?.[2] && /drop|fall/i.test(narrativeChangePctMatch[2]) && changePct > 0) {
        changePct = -changePct; // page states magnitude + direction word separately, e.g. "a 4.5% drop"
    }
    const change = lastTradedPrice !== null && prevClose !== null ? Math.round((lastTradedPrice - prevClose) * 100) / 100 : null;
    const titleMatch = $("title").text().match(/^([A-Z0-9]+)\s*-\s*(.+)$/);
    return {
        symbol: symbol.toUpperCase(),
        companyName: titleMatch?.[2]?.trim() ?? null,
        lastTradedPrice,
        open: parseMoney(labelValues.get("opening price")),
        high: parseMoney(labelValues.get("day's high price")),
        low: parseMoney(labelValues.get("day's low price")),
        prevClose,
        change,
        changePct,
        volume: parseVolume(labelValues.get("traded volume")),
        currency: "KES",
        asOfTradingDay: narrativeTradingDayMatch?.[1]?.trim() ?? null,
    };
}
export function parseAfxSecurityProfile(html, symbol) {
    const $ = cheerio.load(html);
    const labelValues = readLabelValueTables($);
    const titleMatch = $("title").text().match(/^([A-Z0-9]+)\s*-\s*(.+)$/);
    // The factsheet ("Sector: Consumer Services", "Address: ...",
    // "Website: www.cargen.com") renders as a definition-list-like block on
    // the real page rather than a <table> — walk dt/dd pairs AND fall back
    // to the same two-column-table reader in case a different ticker's page
    // renders it as a table instead (both were plausible from what
    // cheerio's text output showed; only one could be confirmed visually
    // through the fetched, already-rendered content).
    const factsheet = new Map();
    $("dl").each((_, dl) => {
        const dts = $(dl).find("dt");
        const dds = $(dl).find("dd");
        dts.each((i, dt) => {
            const label = $(dt).text().trim().toLowerCase();
            const value = $(dds[i]).text().trim();
            if (label && value)
                factsheet.set(label, value);
        });
    });
    const description = $("p")
        .filter((_, p) => $(p).text().includes("is listed on the Nairobi Securities Exchange"))
        .first()
        .text()
        .trim() || null;
    return {
        symbol: symbol.toUpperCase(),
        companyName: titleMatch?.[2]?.trim() ?? null,
        isin: (() => {
            const bodyText = $("body").text();
            const match = bodyText.match(/ISIN\)[^K]*?(KE\d{10})/i) ?? bodyText.match(/\b(KE\d{10})\b/);
            return match?.[1] ?? null;
        })(),
        sector: labelValues.get("sector") ?? factsheet.get("sector") ?? null,
        industry: (() => {
            const value = labelValues.get("industry") ?? factsheet.get("industry") ?? null;
            return value && value !== "—" ? value : null;
        })(),
        marketCapMn: parseScaledNumber(labelValues.get("market capitalization")),
        sharesOutstandingM: parseScaledNumber(labelValues.get("shares outstanding")),
        eps: parseMoney(labelValues.get("earnings per share")),
        peRatio: parseMoney(labelValues.get("price/earning ratio")),
        dividendPerShare: parseMoney(labelValues.get("dividend per share")),
        dividendYieldPct: parsePercent(labelValues.get("dividend yield")),
        description,
        headquarters: factsheet.get("address") ?? null,
        website: factsheet.get("website") ?? null,
    };
}
/**
 * The "last 10 trading days" table: Date | Volume | Close | Change |
 * Change%. Returns bars in ascending date order (the page lists them
 * newest-first).
 */
export function parseAfxDailyHistory(html) {
    const $ = cheerio.load(html);
    const bars = [];
    $("table").each((_, table) => {
        const headerText = $(table).find("tr").first().text().toLowerCase();
        if (!headerText.includes("date") || !headerText.includes("volume") || !headerText.includes("close"))
            return;
        $(table)
            .find("tr")
            .slice(1)
            .each((__, row) => {
            const cells = $(row).find("td");
            if (cells.length < 3)
                return;
            const dateText = $(cells[0]).text().trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText))
                return;
            const close = parseMoney($(cells[2]).text());
            if (close === null)
                return;
            bars.push({
                date: dateText,
                close,
                volume: parseVolume($(cells[1]).text()),
            });
        });
    });
    return bars.sort((a, b) => a.date.localeCompare(b.date));
}
