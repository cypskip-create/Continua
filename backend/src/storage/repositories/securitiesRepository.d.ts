import type { Security, Company, Sector } from "../../types/market.js";
export declare const securitiesRepository: {
    upsertSector(sector: Sector): Promise<void>;
    /** Sector names are meant to be a shared taxonomy across every exchange
     *  (e.g. "Banking" should be the same row whether it came from NSE or
     *  NGX), but each adapter's own mapper computes its own id from the raw
     *  sector string it received — which can genuinely differ between
     *  adapters even for an identical name (confirmed in production: NSE's
     *  own slug for "Unknown" collided with a differently-id'd "Unknown"
     *  row some other exchange's adapter had already created, tripping the
     *  UNIQUE constraint on `name`). Callers seeding a NEW sector should
     *  check this first and reuse the existing id rather than assume their
     *  own computed id is authoritative. */
    getSectorByName(name: string): Promise<Sector | null>;
    upsertCompany(company: Company): Promise<void>;
    upsertSecurity(security: Security): Promise<void>;
    getBySymbol(exchange: string, symbol: string): Promise<Security | null>;
    /** Batch symbol->security lookup, for endpoints that take a list of
     *  symbols (e.g. sparkline batches) and need ids without one query per
     *  symbol. Unknown symbols are simply absent from the result. */
    getBySymbols(exchange: string, symbols: string[]): Promise<Security[]>;
    listByExchange(exchange: string): Promise<Security[]>;
    getCompanyProfile(exchange: string, symbol: string): Promise<(Security & {
        company: Company & {
            sectorName?: string;
            sectorId?: string;
            profileSourceUrl?: string;
            profileObservedAt?: string;
        };
    }) | null>;
    listSectors(): Promise<{
        id: string;
        name: string;
    }[]>;
    /** Full tradable-instrument universe for an exchange, with company name +
     *  sector attached — this is what lets a frontend build its symbol list
     *  (watchlist pickers, screener sector filter, "all stocks" pages) from
     *  the Data Layer instead of a hand-maintained, easily-stale local array. */
    listInstruments(exchange: string): Promise<{
        symbol: string;
        securityId: string;
        companyName: string;
        sector: string | null;
        currency: string;
        status: string;
        isin: string | null;
    }[]>;
};
