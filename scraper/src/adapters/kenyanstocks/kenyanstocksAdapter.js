/**
 * kenyanstocks.com is a Nuxt.js single-page app — confirmed by fetching
 * https://kenyanstocks.com/stock/nse/EQTY directly and getting back only
 * nav links and meta tags, no price/financials/news content. Plain HTTP
 * (what every other adapter in this codebase uses) genuinely cannot see
 * this site's data, so this adapter renders each page with a real
 * browser instead (crawler/renderWithBrowser.ts).
 *
 * The rendered NSE listing and Files-tab DOM were inspected on 11 October
 * 2026. PDF links come from file-content / link[itemprop=url], not guessed
 * download paths. Mirror upload dates are not issuer reporting dates.
 * Summary tables stay review-only; downloaded reports enter the Engine's
 * immutable-source, exact-issuer, period/unit/accounting validation path.
 *
 * ToS/robots status: unverified. isAllowedByRobots() is still checked
 * per URL below (same as every other adapter) — this only controls
 * whether automated fetching is allowed, not whether it's licensed to
 * redistribute what's found (see scraping.sources.license /
 * redistributionAllowed, same gate as everywhere else in this project).
 */
import * as cheerio from "cheerio";
import { extractHtmlFinancialTables } from "../../extraction/htmlFinancialTables.js";
import { renderPage } from "../../crawler/renderWithBrowser.js";
import { isAllowedByRobots } from "../../crawler/robotsCheck.js";
import { sha256 } from "../../crawler/hash.js";
import { storeRawArtifact } from "../../storage/rawStorage.js";
import { upsertArtifact } from "../../storage/rawArtifactsRepository.js";
import { getSource } from "../../storage/sourcesRepository.js";
import { logger } from "../../monitoring/logger.js";
import { kenyanStockLinks, kenyanFileLinks } from './archiveLinks.js';
import { fetchWithRetry } from '../../crawler/httpClient.js';
import { extractPdfText } from '../../extraction/pdfText.js';
import { enqueueDocuments } from '../../storage/documentJobsRepository.js';
import { stockTabDocuments } from './tabPlan.js';
import { extractStockTables } from './stockTables.js';
const ADAPTER_ID = "kenyanstocks";
const CRAWLER_VERSION = "kenyanstocks-adapter-0.3.0";
const BASE_URL = "https://kenyanstocks.com";
const USER_AGENT = "ContinuaBot/1.0 (+https://github.com/cypskip-create/Continua)";
const MIN_USABLE_TEXT_LENGTH = 200;
/**
 * Configured tickers supplement the observed homepage listing, so a
 * partially rendered listing does not silently remove configured issuers.
 */
async function getTickers() {
    const source = await getSource(ADAPTER_ID);
    const tickers = source?.config.tickers;
    if (Array.isArray(tickers) && tickers.length > 0)
        return tickers;
    logger.warn({ sourceId: ADAPTER_ID }, "kenyanstocks adapter: no fallback tickers configured; using observed listing links");
    return [];
}
export const kenyanstocksAdapter = {
    id: ADAPTER_ID,
    parserVersion: CRAWLER_VERSION,
    documentConcurrency: 1,
    persistentBatchSize: 10,
    async discover() {
        const aliases = { DTB: 'DTK', STANBIC: 'SBIC', HFCB: 'HFCK' };
        const tickers = (await getTickers()).map(t => aliases[t.toUpperCase()] ?? t.toUpperCase()).filter(t => /^[A-Z0-9-]+$/.test(t));
        const docs = [];
        const homeAllowed = await isAllowedByRobots(BASE_URL);
        let home = '';
        if (homeAllowed) {
            try {
                home = (await renderPage(BASE_URL, USER_AGENT)).html;
            }
            catch (err) {
                logger.warn({ err }, 'Publisher homepage unavailable; configured issuer discovery retained');
            }
        }
        const links = kenyanStockLinks(home);
        // Follow the publisher's observed complete-list links, not just ticker rails.
        const $ = cheerio.load(home);
        const listingUrls = new Set();
        $('a[href]').each((_, node) => { const href = $(node).attr('href'); if (!href)
            return; try {
            const u = new URL(href, BASE_URL);
            if (u.origin === BASE_URL && ['/stock', '/stocks'].includes(u.pathname))
                listingUrls.add(u.href);
        }
        catch { } });
        for (const listing of listingUrls) {
            if (await isAllowedByRobots(listing)) {
                try {
                    links.push(...kenyanStockLinks((await renderPage(listing, USER_AGENT)).html));
                }
                catch (err) {
                    logger.warn({ listing, err }, 'Full listing unavailable; discovered tickers retained');
                }
            }
        }
        const urls = [...new Set([...links, ...tickers.map(t => `${BASE_URL}/stock/nse/${t.toUpperCase()}`)])];
        for (const url of urls) {
            const allowed = await isAllowedByRobots(url);
            if (!allowed) {
                logger.warn({ url }, "kenyanstocks adapter: disallowed by robots.txt — skipping");
                continue;
            }
            docs.push(...stockTabDocuments(url));
        }
        return docs;
    },
    async fetch(document) {
        if (!await isAllowedByRobots(document.url))
            throw new Error('Publisher robots disallows document');
        const pdf = /\.pdf$/i.test(new URL(document.url).pathname);
        const context = document.context ?? {};
        const rendered = pdf ? null : await renderPage(document.url, USER_AGENT, { stockTab: typeof context.tab === 'string' ? context.tab : undefined, category: typeof context.category === 'string' ? context.category : undefined, historyStart: typeof context.historyStart === 'string' ? context.historyStart : undefined });
        if (rendered) {
            const page = cheerio.load(rendered.html);
            const tabs = page('.normal-tab').map((_, n) => page(n).text().trim()).get();
            // New publisher tabs are discovered from the DOM, not a fixed ceiling.
            if (context.tab === 'Summary')
                await enqueueDocuments(ADAPTER_ID, stockTabDocuments(document.url, tabs));
            if (context.tab === 'Financials') {
                const categories = page('button.tab-btn').map((_, n) => page(n).text().trim()).get();
                if (categories.length)
                    await enqueueDocuments(ADAPTER_ID, stockTabDocuments(document.url, ['Financials'], categories));
            }
            if (context.tab === 'Files' || !context.tab) {
                await enqueueDocuments(ADAPTER_ID, kenyanFileLinks(rendered.html, rendered.finalUrl));
            }
        }
        const res = pdf ? await fetchWithRetry(document.url, { requestsPerSecond: .2 }) : null;
        if (res && res.status !== 200)
            throw new Error(`Document HTTP ${res.status}`);
        const body = res?.body ?? Buffer.from(rendered.html, "utf-8");
        const contentType = pdf ? 'application/pdf' : "text/html; charset=utf-8";
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
            documentUrl: res?.finalUrl ?? rendered.finalUrl,
            sourceUrl: document.discoveredFrom,
            contentType,
            sizeBytes: body.byteLength,
            storagePath,
            title: document.title ?? null,
            crawlerVersion: CRAWLER_VERSION,
            // Flagged explicitly so anyone reading raw_artifacts later knows
            // this HTML came from a rendered browser session, not a plain GET
            // — relevant context if the parsing here is ever revisited.
            metadata: { ...document.context, renderedWithBrowser: !res, coverage: rendered?.coverage ?? null },
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
    async parse(fetched) {
        if (fetched.contentType === 'application/pdf')
            return { ...await extractPdfText(fetched.body), entity: { companyName: null, ticker: null, exchange: 'NSE' } };
        const $ = cheerio.load(fetched.body.toString("utf-8"));
        $("script, style, nav, header, footer, noscript").remove();
        const text = $("body").text().split("\n").map((l) => l.trim()).filter(Boolean).join("\n").trim();
        const looksUsable = text.length >= MIN_USABLE_TEXT_LENGTH;
        return {
            method: "html",
            confidence: looksUsable ? 0.4 : 0.1, // capped below extractByContentType.ts's normal HTML confidence — see module doc comment on why nothing here is a confirmed parse
            text: looksUsable ? text : null,
            tables: [...extractStockTables(fetched.body.toString('utf-8'), String(fetched.document.context?.tab ?? 'Summary'), typeof fetched.document.context?.category === 'string' ? fetched.document.context.category : null), ...extractHtmlFinancialTables(fetched.body.toString("utf-8"))],
            // A section heading is not an issuer name. URL ticker is literal source context.
            entity: { companyName: null, ticker: fetched.document.context?.ticker ?? null, exchange: "NSE" },
            needsReview: true, // always — see module doc comment
        };
    },
};
