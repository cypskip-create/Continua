/**
 * kenyanstocks.com is a Nuxt.js single-page app — confirmed by fetching
 * https://kenyanstocks.com/stock/nse/EQTY directly and getting back only
 * nav links and meta tags, no price/financials/news content. Plain HTTP
 * (what every other adapter in this codebase uses) genuinely cannot see
 * this site's data, so this adapter renders each page with a real
 * browser instead (crawler/renderWithBrowser.ts).
 *
 * WHAT THIS ADAPTER DOES NOT DO, on purpose: parse out structured price/
 * financials fields. The only view available of this site during
 * development was the pre-render HTML shell (via a tool that couldn't
 * execute the SPA's JS) — never the actual rendered DOM. Writing cheerio
 * selectors against markup that was never seen would be guessing, which
 * is exactly what this project has repeatedly ruled out. So parse() here
 * does the same generic thing extractByContentType.ts's HTML branch does
 * for any ordinary page — strip to body text — and flags everything
 * needsReview so nothing from this source is ever silently treated as
 * confirmed. Once someone can see the real rendered DOM (e.g. paste
 * output of `page.content()` after a manual run, or an actual browser's
 * dev tools), a follow-up pass can add real field-level parsing here.
 *
 * ToS/robots status: unverified. isAllowedByRobots() is still checked
 * per URL below (same as every other adapter) — this only controls
 * whether automated fetching is allowed, not whether it's licensed to
 * redistribute what's found (see scraping.sources.license /
 * redistributionAllowed, same gate as everywhere else in this project).
 */
import * as cheerio from "cheerio";
import { renderPage } from "../../crawler/renderWithBrowser.js";
import { isAllowedByRobots } from "../../crawler/robotsCheck.js";
import { sha256 } from "../../crawler/hash.js";
import { storeRawArtifact } from "../../storage/rawStorage.js";
import { upsertArtifact } from "../../storage/rawArtifactsRepository.js";
import { getSource } from "../../storage/sourcesRepository.js";
import { logger } from "../../monitoring/logger.js";
import type { FetchedDocument, ParsedExtraction, SourceAdapter, SourceDocument } from "../types.js";

const ADAPTER_ID = "kenyanstocks";
const CRAWLER_VERSION = "kenyanstocks-adapter-0.1.0";
const BASE_URL = "https://kenyanstocks.com";
const USER_AGENT = "ContinuaBot/1.0 (+https://github.com/cypskip-create/Continua)";
const MIN_USABLE_TEXT_LENGTH = 200;

/**
 * Same "config-driven ticker list" pattern as AfxClient
 * (backend/src/adapters/afx/afxClient.ts) and for the same reason: no
 * verified listing/index page on this site to enumerate the market from,
 * only individual /stock/nse/{TICKER} pages. Set scraping.sources.config
 * → { "tickers": [...] } when seeding this source.
 */
async function getTickers(): Promise<string[]> {
  const source = await getSource(ADAPTER_ID);
  const tickers = source?.config.tickers;
  if (Array.isArray(tickers) && tickers.length > 0) return tickers as string[];
  logger.warn(
    { sourceId: ADAPTER_ID },
    "kenyanstocks adapter: no tickers configured in scraping.sources.config.tickers — discover() will return nothing",
  );
  return [];
}

export const kenyanstocksAdapter: SourceAdapter = {
  id: ADAPTER_ID,
  documentConcurrency: 2,

  async discover(): Promise<SourceDocument[]> {
    const tickers = await getTickers();
    const docs: SourceDocument[] = [];
    for (const ticker of tickers) {
      const url = `${BASE_URL}/stock/nse/${ticker.toUpperCase()}`;
      const allowed = await isAllowedByRobots(url);
      if (!allowed) {
        logger.warn({ url }, "kenyanstocks adapter: disallowed by robots.txt — skipping");
        continue;
      }
      docs.push({ url, title: ticker.toUpperCase(), discoveredFrom: BASE_URL, context: { ticker: ticker.toUpperCase() } });
    }
    return docs;
  },

  async fetch(document: SourceDocument): Promise<FetchedDocument> {
    const rendered = await renderPage(document.url, USER_AGENT);
    const body = Buffer.from(rendered.html, "utf-8");
    const contentType = "text/html; charset=utf-8";
    const bodyHash = sha256(body);
    const storagePath = await storeRawArtifact({
      sourceId: ADAPTER_ID,
      sha256: bodyHash,
      contentType,
      body,
    });

    const { artifact, isNew } = await upsertArtifact({
      sourceId: ADAPTER_ID,
      adapter: ADAPTER_ID,
      sha256: bodyHash,
      documentUrl: rendered.finalUrl,
      sourceUrl: document.discoveredFrom,
      contentType,
      sizeBytes: body.byteLength,
      storagePath,
      title: document.title ?? null,
      crawlerVersion: CRAWLER_VERSION,
      // Flagged explicitly so anyone reading raw_artifacts later knows
      // this HTML came from a rendered browser session, not a plain GET
      // — relevant context if the parsing here is ever revisited.
      metadata: { ...document.context, renderedWithBrowser: true },
    });

    return {
      document,
      sha256: bodyHash,
      contentType,
      sizeBytes: body.byteLength,
      storagePath,
      body,
      isNewArtifact: isNew,
      artifactId: artifact.id,
    };
  },

  async parse(fetched: FetchedDocument): Promise<ParsedExtraction> {
    const $ = cheerio.load(fetched.body.toString("utf-8"));
    $("script, style, nav, header, footer, noscript").remove();
    const text = $("body").text().split("\n").map((l) => l.trim()).filter(Boolean).join("\n").trim();
    const looksUsable = text.length >= MIN_USABLE_TEXT_LENGTH;

    return {
      method: "html",
      confidence: looksUsable ? 0.4 : 0.1, // capped below extractByContentType.ts's normal HTML confidence — see module doc comment on why nothing here is a confirmed parse
      text: looksUsable ? text : null,
      tables: [],
      entity: { companyName: null, ticker: (fetched.document.context?.ticker as string | undefined) ?? null, exchange: "NSE" },
      needsReview: true, // always — see module doc comment
    };
  },
};
