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
import {assertPublicUrl} from './urlSafety.js';
import {throttleHost} from './rateLimiter.js';

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
  coverage?:{tab:string;category:string|null;rows:number;expandedRows:number;scrollLimitReached:boolean};
}

/**
 * Navigates to `url`, waits for network activity to settle (a reasonable
 * proxy for "the SPA has finished its initial data fetch" — not a
 * guarantee for sites with polling/websockets that never go idle), and
 * returns the resulting DOM as HTML.
 */
export async function renderPage(url: string, userAgent: string, options:{files?:boolean;stockTab?:string;category?:string;historyStart?:string}={}): Promise<RenderResult> {
  await assertPublicUrl(url);await throttleHost(new URL(url).hostname,.2);
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent,serviceWorkers:'block' });
  const checked=new Map<string,Promise<unknown>>();
  await context.route('**/*',async route=>{
    try{const target=new URL(route.request().url());if(!['http:','https:'].includes(target.protocol))return route.abort();
      if(!checked.has(target.origin))checked.set(target.origin,assertPublicUrl(target.origin));await checked.get(target.origin);
      if(['image','font','media'].includes(route.request().resourceType()))return route.abort();await route.continue();
    }catch{await route.abort();}
  });
  const page = await context.newPage();
  try {
    // Some publisher category deep-links return 500 although clicking the
    // same category works. Navigate to the observed parent and click it.
    const navigationUrl=new URL(url);if(options.category)navigationUrl.searchParams.delete('category');
    const response = await page.goto(navigationUrl.href, { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS });
    if(response&&response.status()>=400)throw new Error(`Rendered document HTTP ${response.status()}`);
    let expandedRows=0,scrollLimitReached=false;
    if(options.stockTab){
      await page.locator('.normal-tab.selected-tab').filter({hasText:options.stockTab}).waitFor({timeout:15000});
      if(options.category){
        await page.getByRole('button',{name:options.category,exact:true}).click();
        await page.waitForLoadState('networkidle',{timeout:15000});
        const buttons=page.locator('table .expand-button');
        for(const button of (await buttons.all()).slice(0,200)){await button.click();expandedRows++;}
      }
      if(options.historyStart){
        const start=page.getByLabel('Start Date',{exact:true});await start.fill(options.historyStart);await start.press('Tab');
        await page.waitForLoadState('networkidle',{timeout:15000});
      }
      // Lazy content is bounded; all horizontally hidden DOM columns are kept.
      for(let step=0;step<12;step++){
        const before=await page.evaluate("JSON.stringify({height:document.body.scrollHeight,rows:document.querySelectorAll('tr').length,files:document.querySelectorAll('.file-content').length})");
        await page.evaluate("window.scrollTo(0,document.body.scrollHeight)");
        await page.waitForLoadState('networkidle',{timeout:15000});
        const after=await page.evaluate("JSON.stringify({height:document.body.scrollHeight,rows:document.querySelectorAll('tr').length,files:document.querySelectorAll('.file-content').length})");
        if(JSON.stringify(before)===JSON.stringify(after))break;if(step===11)scrollLimitReached=true;
      }
    }
    if(options.files) {
      await page.getByText('Files',{exact:true}).click({timeout:10000});
      // Observed publisher schema.org markup on the Files tab. Do not
      // mistake the lazy summary view for an empty archive.
      await page.locator('.file-content').first().waitFor({timeout:15000});
    }
    const html = await page.content();
    return { html, finalUrl: page.url(), status: response?.status() ?? null,
      ...(options.stockTab?{coverage:{tab:options.stockTab,category:options.category??null,rows:await page.locator('tr').count(),expandedRows,scrollLimitReached}}:{}) };
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
