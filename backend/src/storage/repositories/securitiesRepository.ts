import { query } from "../db.js";
import type { Security, Company, Sector } from "../../types/market.js";

export const securitiesRepository = {
  async upsertSector(sector: Sector): Promise<void> {
    await query(
      `INSERT INTO market.sectors (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [sector.id, sector.name]
    );
  },

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
  async getSectorByName(name: string): Promise<Sector | null> {
    const res = await query<Sector>(`SELECT id, name FROM market.sectors WHERE name = $1`, [name]);
    return res.rows[0] ?? null;
  },

  async upsertCompany(company: Company): Promise<void> {
    await query(
      `INSERT INTO market.companies (id, name, description, sector_id, industry_id, headquarters, ceo, employees, founded, website)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, sector_id = EXCLUDED.sector_id,
         industry_id = EXCLUDED.industry_id, headquarters = EXCLUDED.headquarters, ceo = EXCLUDED.ceo,
         employees = EXCLUDED.employees, founded = EXCLUDED.founded, website = EXCLUDED.website, updated_at = now()`,
      [company.id, company.name, company.description ?? null, company.sectorId ?? null, company.industryId ?? null,
       company.headquarters ?? null, company.ceo ?? null, company.employees ?? null, company.founded ?? null, company.website ?? null]
    );
  },

  async upsertSecurity(security: Security): Promise<void> {
    await query(
      `INSERT INTO market.securities (id, symbol, exchange, company_id, currency, status, isin, listed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         symbol = EXCLUDED.symbol, status = EXCLUDED.status, isin = EXCLUDED.isin, updated_at = now()`,
      [security.id, security.symbol, security.exchange, security.companyId, security.currency,
       security.status, security.isin ?? null, security.listedAt ?? null]
    );
  },

  async getBySymbol(exchange: string, symbol: string): Promise<Security | null> {
    const res = await query<any>(
      `SELECT id, symbol, exchange, company_id as "companyId", currency, status, isin, listed_at as "listedAt"
       FROM market.securities WHERE exchange = $1 AND symbol = $2`,
      [exchange, symbol]
    );
    return res.rows[0] ?? null;
  },

  /** Batch symbol->security lookup, for endpoints that take a list of
   *  symbols (e.g. sparkline batches) and need ids without one query per
   *  symbol. Unknown symbols are simply absent from the result. */
  async getBySymbols(exchange: string, symbols: string[]): Promise<Security[]> {
    if (symbols.length === 0) return [];
    const res = await query<any>(
      `SELECT id, symbol, exchange, company_id as "companyId", currency, status, isin, listed_at as "listedAt"
       FROM market.securities WHERE exchange = $1 AND symbol = ANY($2)`,
      [exchange, symbols.map((s) => s.toUpperCase())]
    );
    return res.rows;
  },

  async listByExchange(exchange: string): Promise<Security[]> {
    const res = await query<any>(
      `SELECT id, symbol, exchange, company_id as "companyId", currency, status, isin, listed_at as "listedAt"
       FROM market.securities WHERE exchange = $1 ORDER BY symbol`,
      [exchange]
    );
    return res.rows;
  },

  async getCompanyProfile(exchange: string, symbol: string): Promise<(Security & { company: Company & { sectorName?: string; sectorId?: string } }) | null> {
    const res = await query<any>(
      `SELECT s.id, s.symbol, s.exchange, s.company_id as "companyId", s.currency, s.status, s.isin, s.listed_at as "listedAt",
              c.name as "companyName", c.description, c.headquarters, c.ceo, c.employees, c.founded, c.website,
              c.sector_id as "sectorId", sec.name as "sectorName"
       FROM market.securities s
       JOIN market.companies c ON c.id = s.company_id
       LEFT JOIN market.sectors sec ON sec.id = c.sector_id
       WHERE s.exchange = $1 AND s.symbol = $2`,
      [exchange, symbol]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id, symbol: row.symbol, exchange: row.exchange, companyId: row.companyId,
      currency: row.currency, status: row.status, isin: row.isin, listedAt: row.listedAt,
      company: {
        id: row.companyId, name: row.companyName, description: row.description, headquarters: row.headquarters,
        ceo: row.ceo, employees: row.employees, founded: row.founded, website: row.website,
        sectorName: row.sectorName, sectorId: row.sectorId,
      },
    };
  },

  async listSectors(): Promise<{ id: string; name: string }[]> {
    const res = await query<any>(`SELECT id, name FROM market.sectors ORDER BY name`);
    return res.rows;
  },

  /** Full tradable-instrument universe for an exchange, with company name +
   *  sector attached — this is what lets a frontend build its symbol list
   *  (watchlist pickers, screener sector filter, "all stocks" pages) from
   *  the Data Layer instead of a hand-maintained, easily-stale local array. */
  async listInstruments(exchange: string): Promise<{
    symbol: string; securityId: string; companyName: string; sector: string | null;
    currency: string; status: string; isin: string | null;
  }[]> {
    const res = await query<any>(
      `SELECT s.symbol, s.id as "securityId", c.name as "companyName", sec.name as sector,
              s.currency, s.status, s.isin
       FROM market.securities s
       JOIN market.companies c ON c.id = s.company_id
       LEFT JOIN market.sectors sec ON sec.id = c.sector_id
       WHERE s.exchange = $1
       ORDER BY s.symbol`,
      [exchange]
    );
    return res.rows;
  },
};