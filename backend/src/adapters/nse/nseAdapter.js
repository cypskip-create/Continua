import { createNseClient } from "./nseClient.js";
import { mapSecurity, mapQuote, mapCandle, mapFundamentalsBundle, mapCorporateAction, mapEarningsEvent, mapOwnership, mapCompany, mapSector, } from "./nseMapper.js";
import { readPublishedNseIndices } from "./nseIndices.js";
import { MyStocksClient } from '../mystocks/mystocksClient.js';
import { AfxClient } from '../afx/afxClient.js';
const INTERVAL_TO_RAW = {
    "1m": "1MIN", "5m": "5MIN", "15m": "15MIN", "1h": "1HR",
    "1d": "1D", "1w": "1W", "1M": "1MO", "1y": "1Y",
};
export class NseAdapter {
    exchange = "NSE";
    client;
    constructor(client = createNseClient()) {
        this.client = client;
    }
    async listSecurities() {
        const raw = await this.client.fetchSecurities();
        return raw.map(mapSecurity);
    }
    /** See IExchangeAdapter.listSecuritiesWithCompanies — pairs each raw
     *  listing with a company/sector derived WITHOUT a profile or
     *  financials, since callers of this only need enough to create a
     *  bare-bones row, and sources like MyStocksClient never have a real
     *  profile to offer anyway (mapCompany(raw, null) already handles a
     *  null profile gracefully — see nseMapper.ts). */
    async listSecuritiesWithCompanies() {
        const raw = await this.client.fetchSecurities();
        return raw.map((r) => ({
            security: mapSecurity(r),
            company: mapCompany(r, null),
            sector: mapSector(r),
        }));
    }
    async getQuotes(symbols) {
        const raw = await this.client.fetchQuotes(symbols);
        return raw.map(mapQuote);
    }
    /** Only publisher observations; individual stock moves cannot recreate
     * the exchange's official index without its divisor and constituents. */
    async getIndices() {
        return readPublishedNseIndices();
    }
    async getCandles(symbol, interval, from, to) {
        const raw = await this.client.fetchCandles(symbol, INTERVAL_TO_RAW[interval], from, to);
        const sourceUrl = this.client instanceof MyStocksClient ? 'https://live.mystocks.co.ke/' : this.client instanceof AfxClient ? `https://afx.kwayisi.org/nse/${symbol.toLowerCase()}.html` : null;
        return raw.map(r => ({ ...mapCandle(r), sourceUrl }));
    }
    async getFundamentals(symbol) {
        const history = await this.getFundamentalsHistory(symbol);
        return history.at(-1) ?? null;
    }
    async getFundamentalsHistory(symbol) {
        const [securities, profile, periods] = await Promise.all([
            this.client.fetchSecurities(),
            this.client.fetchCompanyProfile(symbol),
            this.client.fetchFinancials(symbol),
        ]);
        const security = securities.find((s) => s.Symbol === symbol);
        if (!security)
            return [];
        return periods.map(period => mapFundamentalsBundle(security, profile, period))
            .sort((a, b) => a.period.periodEnd.localeCompare(b.period.periodEnd));
    }
    async getCorporateActions(symbol, since) {
        const raw = await this.client.fetchCorporateActions(symbol, since);
        return raw.map((r, i) => mapCorporateAction(r, `NSE:ca:${r.Symbol}:${r.ActionType}:${r.AnnouncedDate}:${i}`));
    }
    async getEarningsEvents(symbol, since) {
        const raw = await this.client.fetchEarningsEvents(symbol, since);
        return raw.map((r, i) => mapEarningsEvent(r, `NSE:earn:${r.Symbol}:${r.FiscalYear}:${r.FiscalQuarter ?? 0}:${i}`));
    }
    async getOwnership(symbol) {
        const raw = await this.client.fetchOwnership(symbol);
        return raw.map(mapOwnership);
    }
    subscribeQuotes(symbols, onQuote) {
        return this.client.streamQuotes(symbols, (raw) => onQuote(mapQuote(raw)));
    }
}
