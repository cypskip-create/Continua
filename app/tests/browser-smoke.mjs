// Isolated browser checks: all non-local requests are intercepted. No real user,
// portfolio writes, production APIs, publishers, or credentials are used.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { chromium } from '../../scraper/node_modules/playwright/index.mjs';

process.env.VITE_SUPABASE_URL = 'https://continua-test.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
process.env.VITE_CONTINUA_API_URL = 'http://127.0.0.1:4999/api/v1';
process.env.VITE_CONTINUA_API_KEY = 'fixture-only';
process.env.VITE_CONTINUA_WS_URL = 'ws://127.0.0.1:4999';
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root: appRoot, configFile: false, plugins: [react()],
  resolve: { alias: { '@': `${appRoot}/src` } },
  server: { host: '127.0.0.1', port: 5188, strictPort: true, hmr: false } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Test Investor' }, created_at: new Date().toISOString() };
const profile = { ...user, user_id: user.id, full_name: 'Test Investor', handle: 'testinvestor', subscription_plan: 'premium_plus', tradershub_onboarded: true, interests: [], followers_count: 0, following_count: 0 };
const holdings = [{ id: '22222222-2222-4222-8222-222222222222', user_id: user.id, symbol: 'KCB', name: 'KCB Group', shares: 10, avg_cost: 30, sector: 'Banking', created_at: '2025-01-01', updated_at: '2025-01-01' }];
const news = { id: 'fixture-news', headline: 'KCB reports annual earnings growth', excerpt: 'Fixture financial article for reader interaction testing.', content: Array.from({ length: 35 }, (_, i) => `Paragraph ${i + 1}. This is locally generated test content for checking article scrolling. No publisher content is used.`).join('\n\n'), articleUrl: 'https://example.invalid/article', source: 'fixture', sourceName: 'Test financial news', publishedAt: new Date().toISOString(), category: 'earnings', symbols: ['KCB'], imageUrl: '/test-image.svg' };
const fixturePosts = [];
let pollChoice = null;
let uploadRequests = 0;
let newsOffline = false;
let quoteRequests = 0;
let portfolioRequests = 0;
const unknown = new Set();
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  if (url.pathname === '/test-image.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#7862df"/></svg>' });
  if (url.port === '5188') return route.continue();
  if (url.hostname === 'continua-test.supabase.co') {
    if (url.pathname.includes('/storage/v1/object/public/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>'});
    if (url.pathname.includes('/storage/v1/object/post-images/')) { uploadRequests++; return json({Key:'fixture-image'}); }
    if (url.pathname.endsWith('/rpc/post_poll_result')) {
      const body = route.request().postDataJSON();
      if (body.p_choice != null && pollChoice === null) pollChoice = body.p_choice;
      return json({counts:pollChoice === null ? [0,0] : [1,0],choice:pollChoice});
    }
    if (url.pathname.endsWith('/rest/v1/posts')) {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const saved = {...body,id:'33333333-3333-4333-8333-333333333333',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),poll:body.poll ? {...body.poll,endsAt:new Date(Date.now()+86400000).toISOString()} : null};
        fixturePosts.unshift(saved);
        return json(saved);
      }
      return json(route.request().headers().accept?.includes('object') ? fixturePosts[0] ?? null : fixturePosts);
    }
    if (url.pathname.includes('/auth/')) return json(user);
    if (url.pathname.includes('/profiles')) return json(route.request().headers().accept?.includes('object') ? profile : [profile]);
    if (url.pathname.includes('/watchlist_folders')) return json([{ id: 'fixture-folder', user_id: user.id, name: 'Watchlist', is_default: true }]);
    if (url.pathname.includes('/portfolios')) { portfolioRequests++; return json(route.request().headers().accept?.includes('object') ? holdings[0] : holdings); }
    return json([]);
  }
  if (url.port === '4999') {
    const path = url.pathname.replace('/api/v1', '');
    if (path.startsWith('/quotes')) {
      quoteRequests++;
      const symbols = (url.searchParams.get('symbols') || path.split('/')[2] || 'KCB').split(',');
      const quotes = symbols.map((symbol) => ({ symbol, securityId: `NSE:${symbol}`, exchange: 'NSE', lastPrice: 50, open: 48, high: 51, low: 47, previousClose: 49, change: 1, changePercent: 2.04, volume: 10000, currency: 'KES', status: 'active', timestamp: new Date().toISOString(), source: 'eod' }));
      return json({ data: path === '/quotes' ? quotes : quotes[0] });
    }
    if (path.startsWith('/news')) return newsOffline ? json({error:'Fixture offline'},503) : json({ data: path.includes('/item/') ? news : [news] });
    if (path.startsWith('/research/')) return json({ data: { ratios: { pe: 10, pb: 1.5, ps: 2, roe: .15, roa: .05, debtToEquity: .3, dividendYield: .06, netMargin: .2 }, score: { afriScore: 70, afriValue: 60, afriGrowth: 65, afriHealth: 80, afriIncome: 70, afriRisk: 60, afriQuality: 70, afriMomentum: 50, inputs: {} } } });
    if (path.startsWith('/historical/')) return json({ data: Array.from({ length: 30 }, (_, i) => ({ securityId: 'NSE:KCB', interval: '1d', timestamp: new Date(Date.now() - (30 - i) * 86400000).toISOString(), open: 40 + i / 3, high: 41 + i / 3, low: 39 + i / 3, close: 40 + i / 3, volume: 10000 })) });
    if (path.startsWith('/indices') || path.startsWith('/screener') || path.includes('/dividends') || path.includes('/announcements')) return json({ data: [] });
    unknown.add(path);
    return json({ error: 'Fixture data not provided' }, 404);
  }
  return route.abort();
});
await context.addInitScript(({ user, profile }) => {
  const payload = btoa(JSON.stringify({ sub: user.id, exp: 4102444800, role: 'authenticated' }));
  localStorage.setItem('sb-continua-test-auth-token', JSON.stringify({ access_token: `e30.${payload}.fixture`, refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }));
  localStorage.setItem('kenyan-stocks-theme', 'light');
}, { user, profile });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const artifacts = new URL('../../.qa-artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
try {
  await page.goto('http://127.0.0.1:5188/');
  await page.locator('.bottom-nav').waitFor();
  await wait(1600);
  assert.equal(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  for (const [label, path] of [['Markets', '/markets'], ['Portfolio', '/track-investments'], ['TradersHub', '/traders-hub'], ['Profile', '/account'], ['Home', '/']]) {
    await page.locator('.bottom-nav').getByRole('link', { name: label, exact: true }).tap();
    await page.waitForURL(`http://127.0.0.1:5188${path}`);
    console.log(`PASS single tap: ${label}`);
  }
  const dialog = page.getByRole('dialog');
  const cdp = await context.newCDPSession(page);
  // Dragging along the tab bar is not a tap; keyboard activation still works.
  const marketsLink = page.locator('.bottom-nav').getByRole('link', { name: 'Markets', exact: true });
  const navBox = await marketsLink.boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: navBox.x + 20, y: navBox.y + 15 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: navBox.x + 20, y: navBox.y - 50 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(100);
  assert.equal(new URL(page.url()).pathname, '/');
  await marketsLink.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/markets');
  await page.locator('.bottom-nav').getByRole('link', { name: 'Home', exact: true }).tap();
  await page.waitForURL('http://127.0.0.1:5188/');
  console.log('PASS navigation ignores drags and supports keyboard activation');
  for (let articleAttempt = 0; articleAttempt < 4; articleAttempt++) {
  await page.getByText(news.headline, { exact: true }).first().tap();
  await dialog.waitFor();
  await wait(300);
  const box = await dialog.boundingBox();
  assert.ok(box.y < 1 && box.height >= 843, JSON.stringify(box));
  assert.equal(await dialog.evaluate((el) => getComputedStyle(el).animationName), 'panel-rise');
  const scroller = dialog.locator('.overflow-y-scroll');
  const before = await dialog.locator('img').boundingBox();
  await scroller.evaluate((el) => { el.scrollTop = 650; });
  const after = await dialog.locator('img').boundingBox();
  assert.ok(after.y < before.y - 600, 'Article image must move out with the article');
  await page.screenshot({ path: fileURLToPath(new URL('news-mobile.png', artifacts)) });
  await scroller.evaluate((el) => { el.scrollTop = 0; });
  const beforeArticleSwipe = quoteRequests;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 620 }] });
  for (const y of [600, 560, 490, 400, 310, 220]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y }] });
    await wait(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(250);
  assert.ok(await scroller.evaluate((el) => el.scrollTop) > 100, 'Article must respond to an actual touch swipe');
  assert.equal(quoteRequests, beforeArticleSwipe, 'Article swipe must not trigger page refresh');
  await page.evaluate(() => {
    window.__tapEvents = [];
    for (const eventName of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'pointercancel', 'click']) {
      document.addEventListener(eventName, (event) => window.__tapEvents.push({ type: event.type, target: event.target.closest?.('button')?.getAttribute('aria-label'), prevented: event.defaultPrevented }), { capture: true });
    }
  });
  await dialog.getByRole('button', { name: 'Close article' }).tap();
  await dialog.waitFor({ state: 'hidden' });
  console.log('PASS fullscreen bottom-up article, image/content scroll, single-tap close');
  }

  // Trusted mobile gestures at the top of the Home page.
  await page.evaluate(() => window.scrollTo(0, 0));
  const beforePull = quoteRequests;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 205 }] });
  for (const y of [225, 255, 295, 350, 410]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(1000);
  assert.ok(quoteRequests > beforePull, 'Pull must refresh active quotes');
  assert.ok(portfolioRequests >= 2, 'Pull must refresh shared portfolio data');
  console.log('PASS pull-to-refresh fetches active quotes and holdings');

  await page.goto('http://127.0.0.1:5188/stock/KCB');
  await page.getByRole('button', { name: /Update KCB holding/i }).tap();
  await dialog.waitFor();
  await wait(300);
  const sheetBox = await dialog.boundingBox();
  assert.ok(Math.abs(sheetBox.y + sheetBox.height - 844) < 2, 'Holding editor must sit on the bottom edge');
  assert.equal(await dialog.evaluate((el) => getComputedStyle(el).animationName), 'panel-rise');
  await dialog.locator('#shares').fill('2');
  await dialog.locator('#avgCost').fill('40');
  await dialog.getByRole('button', { name: 'Save Changes' }).tap();
  await dialog.waitFor({ state: 'hidden' });
  console.log('PASS bottom-up holding editor and fixture-only save');

  await page.goto('http://127.0.0.1:5188/track-investments');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).tap();
  await page.getByRole('button', { name: 'Past Performance', exact: true }).tap();
  const metric = page.getByRole('button', { name: 'KCB: 15.0%', exact: true });
  await metric.tap();
  assert.ok(await page.getByText(/15.0% · 100.0% portfolio weight/).isVisible());
  await page.screenshot({ path: fileURLToPath(new URL('analysis-mobile.png', artifacts)) });
  await page.evaluate(() => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); });
  await wait(350); // Let the theme color transition finish before measuring contrast.
  const selectedTab = page.getByRole('tab', { name: 'Analysis', exact: true });
  const contrast = await selectedTab.evaluate((el) => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
  assert.notEqual(contrast.foreground, contrast.background);
  await page.screenshot({ path: fileURLToPath(new URL('analysis-dark-mobile.png', artifacts)) });
  await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); });
  await page.getByRole('tab', { name: 'Holdings', exact: true }).tap();
  await page.getByRole('button', { name: 'Share Portfolio', exact: true }).tap();
  await dialog.waitFor();
  assert.equal(await dialog.evaluate((el) => getComputedStyle(el).animationName), 'panel-rise');
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await dialog.waitFor({ state: 'hidden' });
  console.log('PASS interactive metric selection, dark-mode contrast and bottom-up portfolio sharing');

  // Regression checks for tab memory, text sizing and flat page surfaces.
  await page.goto('http://127.0.0.1:5188/traders-hub?tab=media');
  await wait(700);
  await page.locator('.bottom-nav').getByText('Home', { exact: true }).tap();
  await page.locator('.bottom-nav').getByText('TradersHub', { exact: true }).tap();
  await page.waitForURL('**/traders-hub?tab=media');
  console.log('PASS TradersHub restores Media destination');
  await page.locator('.bottom-nav').getByText('Markets', { exact: true }).tap();
  await wait(700);
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await wait(100);
  const savedMarketScroll = await page.evaluate(() => window.scrollY);
  await page.locator('.bottom-nav').getByText('Home', { exact: true }).tap();
  await page.locator('.bottom-nav').getByText('Markets', { exact: true }).tap();
  await wait(700);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - savedMarketScroll) < 3, 'Markets returns to saved scroll offset');
  const surfaces = await page.locator('.content-surface').evaluateAll(nodes => nodes.map(n => {
    const style = getComputedStyle(n);
    return { radius: style.borderRadius, shadow: style.boxShadow, border: style.borderTopWidth };
  }));
  assert.ok(surfaces.length > 0);
  assert.ok(surfaces.every(s => s.radius === '0px' && s.shadow === 'none' && s.border === '0px'));
  await page.locator('.bottom-nav').getByText('Profile', { exact: true }).tap();
  await page.getByRole('button', { name: 'S', exact: true }).tap();
  const small = await page.getByText('Text size', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await page.getByRole('button', { name: 'XL', exact: true }).tap();
  const large = await page.getByText('Text size', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(large > small * 1.25, 'Text setting must visibly scale rem labels');
  await page.reload();
  await page.getByText('Text size', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.style.fontSize), '19.2px');
  await page.getByRole('button', { name: 'M', exact: true }).tap();
  console.log('PASS saved scroll, flat surfaces and persistent global text sizing');

  await page.goto('http://127.0.0.1:5188/traders-hub');
  await page.getByRole('button', {name:'Create post',exact:true}).tap();
  await page.getByRole('dialog', {name:'Compose post'}).waitFor();
  const composer = page.getByRole('dialog', {name:'Compose post'});
  await wait(300);
  assert.equal(await composer.evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.setViewportSize({width:390,height:430});
  await wait(200);
  const composeBox = await composer.boundingBox();
  assert.ok(composeBox.y >= 0 && composeBox.y + composeBox.height <= 431, 'Composer remains in keyboard-sized visual viewport');
  await composer.locator('textarea').fill('Fixture post with five images and a poll');
  await composer.getByRole('button',{name:'Add poll',exact:true}).tap();
  await composer.getByRole('textbox',{name:'Poll question',exact:true}).fill('Which research tool do you use?');
  await composer.getByRole('textbox',{name:'Poll option 1',exact:true}).fill('Charts');
  await composer.getByRole('textbox',{name:'Poll option 2',exact:true}).fill('Fundamentals');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
  await composer.locator('input[type=file]').setInputFiles(Array.from({length:5},(_,i)=>({name:`image-${i}.png`,mimeType:'image/png',buffer:pixel})));
  await composer.getByAltText('Selected image 5',{exact:true}).waitFor();
  assert.equal(await composer.getByRole('button',{name:'Add images'}).isDisabled(),true);
  await composer.getByRole('button',{name:'Post',exact:true}).tap();
  await composer.waitFor({state:'hidden'});
  assert.equal(uploadRequests,5);
  assert.equal(fixturePosts[0].image_urls.length,5);
  assert.ok(fixturePosts[0].image_urls.every(url=>url.startsWith('https://')));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open image 5 of 5'}).waitFor();
  await page.getByRole('button',{name:'Charts',exact:true}).tap();
  await page.getByText('1 votes',{exact:false}).waitFor();
  assert.equal(pollChoice,0);
  console.log('PASS centred composer, keyboard-sized viewport, five uploads, inline gallery and poll voting');

  // A backend outage must not masquerade as an empty feed.
  newsOffline = true;
  await page.goto('http://127.0.0.1:5188/traders-hub?tab=media');
  await page.getByText(/News could not refresh/).waitFor();
  await page.getByText(news.headline,{exact:true}).waitFor();
  assert.equal(await page.getByText('No stories yet',{exact:true}).count(),0);
  newsOffline = false;
  console.log('PASS news outage retains saved stories and shows an explicit error');

  // Route smoke coverage exercises mounted empty/error states, not every mutation.
  for (const path of ['/markets', '/discover', '/account', '/upgrade', '/settings', '/stock/KCB', '/watchlist', '/sector/Banking', '/theme/dividends', '/featured/dividends', '/learn', '/notifications', '/sector-heatmap', '/track-investments', '/traders-hub', '/rooms', '/screener', '/compare', `/profile/${user.id}`, '/traders-hub/post/missing', '/not-a-route']) {
    await page.goto(`http://127.0.0.1:5188${path}`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, undefined, { timeout: 15_000 });
    await wait(500);
    assert.ok((await page.locator('body').innerText()).trim().length > 0, `Blank route: ${path}`);
    console.log(`PASS route mount: ${path}`);
  }
  await page.goto('http://127.0.0.1:5188/markets');
  await wait(700);
  await page.evaluate(() => { window.history.pushState({}, '', '/stock/KCB'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'Back to markets' }).tap();
  await page.waitForURL('**/markets');
  console.log('PASS single-tap stock back');
  // Device verification is stubbed to fail: private UI must stay unmounted.
  // This tests the lock boundary, not a real platform authenticator.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.credentials, 'get', { value: async () => null });
  });
  await page.evaluate((id) => {
    localStorage.setItem(`continua_app_lock_${id}`, '1');
    localStorage.setItem(`continua_app_lock_cred_${id}`, 'AQID');
  }, user.id);
  await page.reload();
  await page.getByText('Continua is locked', { exact: true }).waitFor();
  await page.getByText('Verification failed or was cancelled. Try again.', { exact: true }).waitFor();
  assert.equal(await page.locator('.bottom-nav').count(), 0);
  console.log('PASS failed device verification keeps private screens unmounted');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log('PASS no uncaught browser exceptions. Unprovided fixture endpoints:', [...unknown].join(', '));
} catch (error) {
  console.error('Uncaught browser errors:', errors);
  console.error('Last touch events:', await page.evaluate(() => window.__tapEvents));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
