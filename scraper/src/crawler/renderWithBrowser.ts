/**
 * Renders a page with a real (headless) browser instead of a plain HTTP
 * GET, for sites where the content that matters doesn't exist until
 * client-side JS runs — confirmed to be the case for kenyanstocks.com
 * (fetching it with a plain request returns only nav links and meta
 * tags; the price/financials/news are built by a Nuxt.js app after
 * load). This is also the tool the deferred NSE historical-price
 * backfill (year-tab pagination, AJAX-driven) will need — one renderer,
 * two future consumers.
 *
 * Deliberately minimal: one browser instance reused across calls (launch
 * cost is real — don't pay it per page), one page per call, closed
 * immediately after. No stealth/anti-detection tricks — if a site
 * actively blocks headless browsers, that's a signal to stop, not a
 * puzzle to route around.
 *
 * OPERATIONAL NOTE: Playwright needs browser binaries + OS-level shared
 * libraries that a plain `npm install` does not provide. scraper/Dockerfile
 * builds on Microsoft's official Playwright image (mcr.microsoft.com/
 * playwright), which ships both — verify the image tag's version still
 * matches package.json's "playwright" version whenever that dependency is
 * bumped, since a mismatch is exactly the failure mode this note used to
 * warn about.
 */
import { chromium, type Browser } from "playwright";
import { logger } from "../monitoring/logger.js";

const NAVIGATION_TIMEOUT_MS = 30_000;

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null; // let the next call retry launching rather than caching a permanent failure
      throw err;
    });
  }
  return browserPromise;
}

export interface RenderResult {
  html: string;
  finalUrl: string;
  status: number | null;
}

/**
 * Navigates to `url`, waits for network activity to settle (a reasonable
 * proxy for "the SPA has finished its initial data fetch" — not a
 * guarantee for sites with polling/websockets that never go idle), and
 * returns the resulting DOM as HTML.
 */
export async function renderPage(url: string, userAgent: string): Promise<RenderResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS });
    const html = await page.content();
    return { html, finalUrl: page.url(), status: response?.status() ?? null };
  } catch (err) {
    logger.warn({ url, err }, "renderPage: navigation failed");
    throw err;
  } finally {
    await context.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}