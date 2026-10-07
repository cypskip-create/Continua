// Public landing-page QA. Remote requests are blocked; no production writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { chromium } from '../../scraper/node_modules/playwright/index.mjs';
process.env.VITE_SUPABASE_URL='https://continua-test.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY='test-public-key';
process.env.VITE_CONTINUA_API_URL='http://127.0.0.1:4999/api/v1';
const root=fileURLToPath(new URL('../',import.meta.url));
const artifacts=fileURLToPath(new URL('../../.qa-artifacts/',import.meta.url));
await mkdir(artifacts,{recursive:true});
const server=await createServer({root,configFile:false,plugins:[react()],resolve:{alias:{'@':`${root}/src`}},server:{host:'127.0.0.1',port:5190,strictPort:true,hmr:false}});
await server.listen();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
const errors=[];
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5190/landing');
  await page.getByRole('heading',{name:'Your portfolio. A clearer perspective.'}).waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.title(),'Continua — Your portfolio. A clearer perspective.');
  await page.screenshot({path:`${artifacts}/landing-desktop.png`});
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
    for(const name of ['Portfolio','Fundamentals','TradersHub']) {
      await page.getByRole('tab',{name,exact:true}).click();
      assert.equal(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow at ${width}`);
    }
  }
  await page.getByRole('tab',{name:'Portfolio',exact:true}).click();
  await page.getByRole('tab',{name:'Portfolio',exact:true}).press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Fundamentals',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Explore all tools',exact:true}).click();
  await page.getByRole('heading',{name:'Learning & control',exact:true}).waitFor();
  await page.getByText('Can I trade on Continua?',{exact:true}).click();
  await page.getByText('No. Continua is a research, community and portfolio-tracking app.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('navigation',{name:'Expanded navigation'}).getByRole('link',{name:'Continua Engine'}).click();
  assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).getAttribute('aria-expanded'),'false');
  await page.locator('#engine img').scrollIntoViewIfNeeded();
  await page.locator('#engine img').evaluate(img=>img.decode());
  assert.ok(await page.locator('#engine img').evaluate(img=>img.naturalWidth>0));
  await page.screenshot({path:`${artifacts}/landing-engine.png`});
  await page.locator('.lp-film').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await page.getByRole('button',{name:'Pause motion',exact:true}).click();
  const value=await page.locator('.lp-film-value').innerText();
  await page.waitForTimeout(2000);
  assert.equal(await page.locator('.lp-film-value').innerText(),value);
  assert.equal(await page.locator('.lp-film').getAttribute('data-running'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Play motion',exact:true}).click();
  assert.equal(await page.locator('.lp-film').getAttribute('data-running'),'false');
  assert.equal(await page.locator('.lp-art-disc').evaluate(e=>getComputedStyle(e).animationName),'none');
  const invalidAnchors=await page.evaluate(()=>Array.from(document.querySelectorAll('.continua-landing a[href^="#"]')).filter(a=>!document.getElementById(a.getAttribute('href').slice(1))).map(a=>a.getAttribute('href')));
  assert.deepEqual(invalidAnchors,[]);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${artifacts}/landing-mobile.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS landing: responsive widths, product tabs, keyboard, menu, FAQ, image, anchors, pause and reduced motion; no uncaught errors');
} finally { await browser.close(); await server.close(); }
