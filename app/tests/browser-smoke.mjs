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
let engineRequests = 0;
let enginePreferences={goal:'Balanced',horizon:'1_to_5_years',experience:'beginner',riskComfort:'unspecified',incomeNeeds:'none',sectors:[],notifications:true,learnInterests:false,interests:[]};
let engineRules=[];
let engineFlows=[];
let assistantRequests=0;

const unknown = new Set();
const handleRoute = async (route) => {
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
    if (url.pathname.endsWith('/auth/v1/token')) return json({ access_token: `e30.${btoa(JSON.stringify({sub:user.id,exp:4102444800,role:'authenticated'}))}.fixture`, refresh_token: 'fixture', expires_in: 3600, token_type: 'bearer', user });
    if (url.pathname.endsWith('/rpc/record_research_view') || url.pathname.endsWith('/rpc/get_research_quota')) return json({ allowed: true, is_premium: true, already_counted: true, limit: null, remaining: null });
    if (url.pathname.includes('/auth/')) return json(user);
    if (url.pathname.includes('/profiles')) return json(route.request().headers().accept?.includes('object') ? profile : [profile]);
    if (url.pathname.includes('/watchlist_folders')) return json([{ id: 'fixture-folder', user_id: user.id, name: 'Watchlist', is_default: true }]);
    if (url.pathname.includes('/portfolios')) { portfolioRequests++; return json(route.request().headers().accept?.includes('object') ? holdings[0] : holdings); }
    return json([]);
  }
  if (url.port === '4999') {
    const path = url.pathname.replace('/api/v1', '');
    if(path.startsWith('/engine/')) assert.ok(route.request().headers()['x-user-token'],'Private Engine requests include a verified session token');
    if(path === '/engine/preferences') {if(route.request().method()==='POST')enginePreferences=route.request().postDataJSON();return json({data:enginePreferences});}
    if(path === '/engine/interests') {if(route.request().postDataJSON().reset)enginePreferences.interests=[];return json({data:enginePreferences});}
    if(path === '/engine/usage')return json({data:{requests:assistantRequests,reserved:assistantRequests*.01,monthlyApplicationCap:5,dailyUserLimit:20,model:'gpt-5.4-mini',configured:true}});
    if(path === '/engine/assistant'){assistantRequests++;return json({data:{answer:'The fixture filing reports 12% revenue growth.',citations:['fixture-filing'],limitations:['Fixture data only.'],cached:false,sources:[{id:'fixture-filing',title:'Fixture annual filing',asOf:'2026-10-07',url:null}]}});}
    if(path === '/engine/monitoring'){if(route.request().method()==='POST'){const body=route.request().postDataJSON();const prior=engineRules.find(r=>r.symbol===body.symbol&&r.kind===body.kind);if(prior)Object.assign(prior,body);else engineRules.push({...body,id:'44444444-4444-4444-8444-444444444444'});}return json({data:engineRules});}
    if(path.startsWith('/engine/monitoring/')){engineRules=[];return json({data:{deleted:true}});}
    if(path === '/engine/cash-flows'){const b=route.request().postDataJSON();engineFlows.push({...b,id:'55555555-5555-4555-8555-555555555555'});return json({data:{id:engineFlows[0].id}});}
    if(path.startsWith('/engine/cash-flows/')){engineFlows=[];return json({data:{deleted:true}});}
    if(path === '/engine/peers')return json({data:[{symbol:'EQTY',name:'Fixture peer',period:2025,metrics:{revenueGrowth:10,cashConversion:1.2,debtToEquity:.4}}]});
    if(path === '/engine/portfolio')return json({data:{available:true,reason:null,totalValue:500,sessionPnl:10,coverage:'1/1',currency:'KES',warnings:[],historyWarnings:[],positions:[{symbol:'KCB',sector:'Banking',value:500,weight:1,sessionContribution:10,asOf:'2026-10-07'}],sectors:[{sector:'Banking',weight:1}],correlations:{pairs:[],methodology:'Identical dates required.'},performance:{twr:10,moneyWeighted:null,reason:'Fixture dated snapshots.'},dividends:[{symbol:'KCB',trailingIncome:20,upcoming:[]}],flows:engineFlows,methodology:'Covered holdings only.'}});
    if (path.startsWith('/engine/')) {
      engineRequests++;
      assert.ok(route.request().headers()['x-user-token'], 'Engine sends the authenticated session');
      return json({data:{symbol:'KCB',exchange:'NSE',currency:'KES',companyName:'KCB Group',generatedAt:new Date().toISOString(),quote:{lastPrice:50},history:[],earnings:[],ownership:[{holderName:'Fixture institutional holder',holderType:'institutional',percentHeld:12,asOf:'2025-12-31'}],valuation:{models:[{model:'Fixture valuation',fairValue:60,upsidePercent:20,methodology:'Fixture-only disclosed methodology'}]},briefing:{facts:['Fixture reported revenue increased.'],strengths:[],risks:[],coverage:'Two reported periods.',methodology:'Calculated from fixture financial statements.'},unavailable:[],news:[{id:'digest-test',headline:'Fixture company update',summary:'Revenue increased by 12 percent.',source:'Fixture publisher',url:'https://example.invalid/source',publishedAt:'2026-10-07',methodology:'Extractive source sentences',fullTextAvailable:true}],technicals:[],coverage:{annualPeriods:2,valuationModels:1,earningsEvents:0,analystEstimates:0}}});
    }
    if (path.startsWith('/quotes')) {
      quoteRequests++;
      const symbols = (url.searchParams.get('symbols') || path.split('/')[2] || 'KCB').split(',');
      const quotes = symbols.map((symbol) => ({ symbol, securityId: `NSE:${symbol}`, exchange: 'NSE', lastPrice: 50, open: 48, high: 51, low: 47, previousClose: 49, change: 1, changePercent: 2.04, volume: 10000, currency: 'KES', status: 'active', timestamp: new Date().toISOString(), source: 'eod' }));
      return json({ data: path === '/quotes' ? quotes : quotes[0] });
    }
    if (path.startsWith('/news')) return newsOffline ? json({error:'Fixture offline'},503) : json({ data: path.includes('/item/') ? news : [news] });
    if (path.startsWith('/financials/') && path.endsWith('/history')) return json({ data: [2023,2024,2025].map((year,i) => ({fiscalYear:year,fiscalQuarter:url.searchParams.get('periodType') === 'quarterly' ? 1 : null,revenue:1000000+i*100000,netIncome:i === 0 ? -100000 : 100000+i*50000,eps:1+i,totalAssets:4000000,totalLiabilities:1000000,totalEquity:3000000,operatingIncome:300000,operatingCashFlow:350000,freeCashFlow:200000})) });
    if (path.startsWith('/earnings/') && !path.endsWith('/recent')) return json({ data: [2024,2025,2026].map((year,i) => ({id:`earn-${year}`,fiscalYear:year,fiscalQuarter:null,reportedDate:i<2 ? `${year}-03-01` : null,revenueActual:i<2 ? 1000000+i*100000 : null,revenueEstimate:1050000+i*100000,epsActual:i<2 ? 1+i : null,epsEstimate:1.1+i})) });
    if (path.startsWith('/research/')) return json({ data: { ratios: { pe: 10, pb: 1.5, ps: 2, roe: .15, roa: .05, debtToEquity: .3, dividendYield: .06, netMargin: .2 }, score: { afriScore: 70, afriValue: 60, afriGrowth: 65, afriHealth: 80, afriIncome: 70, afriRisk: 60, afriQuality: 70, afriMomentum: 50, inputs: {} } } });
    if (path.startsWith('/historical/')) return json({ data: Array.from({ length: 30 }, (_, i) => ({ securityId: 'NSE:KCB', interval: '1d', timestamp: new Date(Date.now() - (30 - i) * 86400000).toISOString(), open: 40 + i / 3, high: 41 + i / 3, low: 39 + i / 3, close: 40 + i / 3, volume: 10000 })) });
    if (path.startsWith('/indices') || path.startsWith('/screener') || path.includes('/dividends') || path.includes('/announcements')) return json({ data: [] });
    unknown.add(path);
    return json({ error: 'Fixture data not provided' }, 404);
  }
  return route.abort();
};
await context.route('**/*', handleRoute);
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
  const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await loginContext.route('**/*', handleRoute);
  const loginPage = await loginContext.newPage();
  await loginPage.goto('http://127.0.0.1:5188/auth');
  await loginPage.locator('input[type="email"]').first().fill(user.email);
  await loginPage.locator('input[type="password"]').first().fill('FixturePassword123!');
  await loginPage.locator('form').getByRole('button', { name: /Sign In|Log In|Login/i, exact: true }).tap();
  await loginPage.waitForURL('http://127.0.0.1:5188/', { timeout: 15000 });
  await loginPage.locator('.bottom-nav').waitFor();
  console.log('PASS first login navigates on one submit despite AppLockGate remount');
  await loginContext.close();
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
  const resumedMarketScroll = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(resumedMarketScroll - savedMarketScroll) < 3, `Markets returns to saved scroll offset: expected ${savedMarketScroll}, got ${resumedMarketScroll}`);
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

  await page.goto('http://127.0.0.1:5188/stock/KCB');
  await page.getByRole('button', {name:'Fundamentals',exact:true}).tap();
  const categories = page.getByRole('tablist',{name:'Fundamentals category'});
  await categories.waitFor();
  await page.getByRole('img',{name:'revenue actual and estimate history'}).scrollIntoViewIfNeeded();
  await page.getByRole('tablist',{name:'Estimates metric'}).getByRole('tab',{name:'EPS',exact:true}).tap();
  await page.getByRole('img',{name:'eps actual and estimate history'}).waitFor();
  const periodTabs = page.getByRole('tablist',{name:'Financial period'});
  await periodTabs.getByRole('tab',{name:'Quarterly',exact:true}).tap();
  await page.getByRole('img',{name:'Revenue history',exact:true}).first().scrollIntoViewIfNeeded();
  assert.equal(await periodTabs.getByRole('tab',{name:'Quarterly',exact:true}).getAttribute('aria-selected'),'true');
  const sticky = await categories.boundingBox();
  assert.ok(sticky.y >= 90 && sticky.y < 120, `Fundamentals subnav stays under primary tabs: ${sticky.y}`);
  await page.screenshot({path:fileURLToPath(new URL('fundamentals-sticky.png', artifacts))});
  console.log('PASS Fundamentals charts, metric switching, quarterly control and sticky categories');

  await page.goto('http://127.0.0.1:5188/engine?symbol=KCB');
  await page.getByText('Fixture reported revenue increased.',{exact:true}).waitFor();
  const engineTools = page.getByRole('tablist',{name:'Engine tools'});
  await engineTools.getByRole('tab',{name:'Valuation',exact:true}).tap();
  await page.getByText('Fixture valuation',{exact:true}).waitFor();
  await engineTools.getByRole('tab',{name:'Ownership',exact:true}).tap();
  await page.getByText('Fixture institutional holder',{exact:true}).waitFor();
  await engineTools.getByRole('tab',{name:'Earnings & forecasts',exact:true}).tap();
  await page.getByRole('img',{name:'revenue actual and estimate history'}).waitFor();
  await engineTools.getByRole('tab', {name:'News',exact:true}).tap();
  await page.getByText('Revenue increased by 12 percent.', {exact:true}).waitFor();
  assert.equal(await page.getByRole('link', {name:'Fixture company update'}).getAttribute('href'), 'https://example.invalid/source');
  await engineTools.getByRole('tab', {name:'Briefing',exact:true}).tap();
  await page.getByLabel('Research goal', {exact:true}).selectOption('Income');
  await page.getByText('Evidence ordered for your income research goal', {exact:true}).waitFor();
  await page.reload();
  await page.getByText('Evidence ordered for your income research goal', {exact:true}).waitFor();
  console.log('PASS sourced news digest and persisted preference ordering');
  const requestsBeforeRefresh = engineRequests;
  await page.getByRole('button',{name:'Refresh Engine analysis'}).tap();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Refresh Engine analysis"]')?.disabled);
  assert.ok(engineRequests > requestsBeforeRefresh,'Engine refresh requests fresh analysis');
  await engineTools.getByRole('tab',{name:'Scenario lab',exact:true}).tap();
  await page.getByRole('spinbutton',{name:'Scenario annual growth percent'}).fill('15');
  await page.getByRole('img',{name:'Revenue scenario forecast'}).waitFor();
  await page.screenshot({path:fileURLToPath(new URL('engine-scenario.png',artifacts))});
  console.log('PASS paid Engine briefing, valuation, ownership, sourced estimates, scenarios and refresh');
  await engineTools.getByRole('tab',{name:'Preferences',exact:true}).tap();
  await page.getByRole('heading',{name:'Research preferences',exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Learn research interests from companies I open in Engine'}).check();
  await page.getByRole('button',{name:'Save preferences',exact:true}).tap();
  await page.getByText('Preferences saved.',{exact:true}).waitFor();
  assert.equal(enginePreferences.learnInterests,true);
  await engineTools.getByRole('tab',{name:'Monitoring',exact:true}).tap();
  await page.getByRole('button',{name:'Save rule',exact:true}).tap();
  await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
  await page.getByRole('button',{name:'Pause',exact:true}).tap();
  await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove',exact:true}).tap();
  await page.getByRole('button',{name:'Remove',exact:true}).waitFor({state:'hidden'});
  await engineTools.getByRole('tab',{name:'Peers',exact:true}).tap();
  await page.getByRole('heading',{name:/EQTY · Fixture peer/}).waitFor();
  await engineTools.getByRole('tab',{name:'Portfolio',exact:true}).tap();
  await page.getByRole('heading',{name:'Recorded invested-holdings return',exact:true}).waitFor();
  await page.getByLabel('Cash flow amount',{exact:true}).fill('50');
  await page.getByRole('button',{name:'Record flow',exact:true}).tap();
  await page.getByRole('button',{name:'Remove',exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove',exact:true}).tap();
  await page.getByRole('button',{name:'Remove',exact:true}).waitFor({state:'hidden'});
  await engineTools.getByRole('tab',{name:'Ask Engine',exact:true}).tap();
  assert.equal(assistantRequests,0,'AI never runs automatically');
  await page.getByLabel('Research question',{exact:true}).fill('What do the reported results show?');
  await page.getByRole('button',{name:'Ask Engine',exact:true}).tap();
  await page.getByText('The fixture filing reports 12% revenue growth.',{exact:true}).waitFor();
  await page.getByText(/Fixture annual filing/).waitFor();
  assert.equal(assistantRequests,1);
  console.log('PASS cloud preferences, consent, monitoring pause/remove, peers, flow corrections and explicit sourced AI');


  const freeContext = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await freeContext.route('**/*',handleRoute);
  await freeContext.addInitScript((user) => {
    const payload=btoa(JSON.stringify({sub:user.id,exp:4102444800,role:'authenticated'}));
    localStorage.setItem('sb-continua-test-auth-token',JSON.stringify({access_token:`e30.${payload}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:3600,token_type:'bearer',user}));
  },user);
  const savedPlan=profile.subscription_plan;
  profile.subscription_plan='free';
  const freePage=await freeContext.newPage();
  const beforeFree=engineRequests;
  try {
    await freePage.goto('http://127.0.0.1:5188/engine?symbol=KCB');
    await freePage.getByText('Engine is included with Premium',{exact:true}).waitFor();
    assert.equal(engineRequests,beforeFree,'Free users never fetch Engine output');
    assert.equal(await freePage.getByRole('tablist',{name:'Engine tools'}).count(),0);
  } finally {profile.subscription_plan=savedPlan; await freeContext.close();}
  console.log('PASS free Engine lock prevents fetching paid analysis');

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
  // Every supported text scale must keep sticky rows flush and contained.
  for (const route of ['/stock/KCB', '/track-investments', '/']) {
    await page.goto('http://127.0.0.1:5188' + route);
    await wait(700);
    for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width, height:844});
    for (const scale of [0.9, 1, 1.1, 1.2]) {
      await page.evaluate(scale => { document.documentElement.style.fontSize = (16 * scale) + 'px'; }, scale);
      await wait(350);
      const layout = await page.evaluate(() => {
        const root = document.querySelector('.page-canvas');
        const header = root?.querySelector('[data-sticky-header]');
        const nav = root?.querySelector('[data-sticky-nav]');
        return { overflow: document.documentElement.scrollWidth - innerWidth,
          header: header?.getBoundingClientRect().height,
          top: nav ? parseFloat(getComputedStyle(nav).top) : undefined };
      });
      assert.ok(layout.overflow <= 1, route + ' horizontal overflow at scale ' + scale + ': ' + layout.overflow);
      if (layout.header != null && layout.top != null) assert.ok(Math.abs(layout.header - layout.top) < 1, route + ' sticky gap at width ' + width + ' scale ' + scale + ': ' + JSON.stringify(layout));
    }
  }
    }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => { document.documentElement.style.fontSize = '16px'; });
  console.log('PASS four font sizes: stock, portfolio and Home containment and sticky offsets');
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
