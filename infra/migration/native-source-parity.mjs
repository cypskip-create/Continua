/** Native publisher parser comparisons. No network, database or provider calls. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.env.NODE_ENV='test';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
const {afxProfileFacts,afxCloseCandidates}=await import('../../scraper/src/adapters/afx/afxAdapter.js');
const {archiveFormConfig,archivePageNumbers,archiveDocuments,archiveCategoryLinks,canonicalArchiveUrl}=await import('../../scraper/src/adapters/nse/archiveDiscovery.js');
const {extractArticleBodyText}=await import('../../scraper/src/extraction/articleBodyText.js');
const {kenyanStockLinks,kenyanFileLinks}=await import('../../scraper/src/adapters/kenyanstocks/archiveLinks.js');
const {extractStockTables,publisherNumber,publisherDate}=await import('../../scraper/src/adapters/kenyanstocks/stockTables.js');
const {extractHtmlFinancialTables}=await import('../../scraper/src/extraction/htmlFinancialTables.js');
const {extractTablesFromText}=await import('../../scraper/src/extraction/tableExtract.js');
const {extractNseIndexSummary}=await import('../../scraper/src/extraction/nseIndexSummary.js');
const {extractFromHtml}=await import('../../scraper/src/crawler/htmlExtract.js');
const {canonicalizeUrl}=await import('../../scraper/src/crawler/urlNormalize.js');
const {matchesDiscoveryPaths}=await import('../../scraper/src/crawler/discoveryPolicy.js');
const operations={nse_index_summary:extractNseIndexSummary,extract_from_html:extractFromHtml,canonicalize_url:canonicalizeUrl,matches_discovery_paths:matchesDiscoveryPaths,afx_profile_facts:afxProfileFacts,afx_close_candidates:afxCloseCandidates,archive_form_config:archiveFormConfig,archive_page_numbers:archivePageNumbers,archive_documents:archiveDocuments,archive_category_links:archiveCategoryLinks,canonical_archive_url:canonicalArchiveUrl,article_body_text:extractArticleBodyText,kenyan_stock_links:kenyanStockLinks,kenyan_file_links:kenyanFileLinks,stock_tables:extractStockTables,publisher_number:publisherNumber,publisher_date:publisherDate,html_financial_tables:extractHtmlFinancialTables,text_tables:extractTablesFromText};
const cases=[];
const add=(operation,...args)=>cases.push({operation,args});
for(const url of ['https://example.test/','https://EXAMPLE.test:443/report/?year=2025#top','http://example.test:80/path/'])add('canonicalize_url',url);
for(const patterns of [[],['.pdf'],['/investor']])add('matches_discovery_paths','https://example.test/investor/filing.pdf?x=1',patterns);
add('extract_from_html','<title>Source</title><meta name="description" content="Evidence"><meta property="og:image" content="image"><script type="application/ld+json">{"name":"Issuer"}</script><a href="report.pdf">Report</a><iframe src="/frame"></iframe><link rel="canonical" href="/issuer">','https://example.test/page');
for(const stamp of ['12-OCT-26','30-FEB-26','12-XYZ-26'])add('nse_index_summary',`<div class="stat_date">Statistics As of ${stamp}</div><div class="nse_statistics"><div class="stat_col"><div class="stat_head">NSE ALL SHARE INDEX</div><div class="stat_figures"><p>244.93<span class="stat_percent">-0.42</span></p></div></div></div>`);
for(const n of ['KES 25.46 B','(100.20)','▲ 126.28K','▼ 10%','--','1,200','(-2)','1.3T','zero',''])add('publisher_number',n);
for(const d of ['12/10/26','29/02/24','29/02/25','12 October 2026','1 Jan 2021','2026-01-01',''])add('publisher_date',d);
for(const text of ['', 'INCOME STATEMENT\n2025 2024\nRevenue 100 90\nProfit 10 9\n','TABLE OF CONTENTS\nPURPOSE ...... 5\nINTRODUCTION ...... 6\n','STATEMENT\nRevenue 100\nProfit 20 10\nOther heading\nCash 30\nDebt 40\n'])add('text_tables',text);
const article='<html><body><nav>Noise</nav><article><h1>Issuer results</h1><p>The issuer reported an audited improvement with actual filing evidence.</p><div class="related"><p>Unrelated article links should not appear in body evidence.</p></div><p>Second paragraph includes more context about the financial statement.</p></article></body></html>';
for(const h of ['',article,'<main><p>Subscribe to follow us</p><p>KES 30 +2% KES 20 -1%</p><p>A substantive paragraph contains the source narrative.</p></main>'])add('article_body_text',h);
const profile='<div data-fact><h3>Factsheet of KCB Group PLC</h3><dl><dt>Sector</dt><dd>Banking</dd><dt>Website</dt><dd>https://example.test</dd><dt>Other</dt><dd>ignored</dd></dl></div>';
add('afx_profile_facts',profile);add('afx_profile_facts','<h3>No issuer block</h3>');
const history='<table><tr><th>Date</th><th>Volume</th><th>Close</th></tr><tr><td>2026-01-01</td><td>1,000</td><td>20.50</td></tr><tr><td>2026-02-30</td><td>1</td><td>20</td></tr><tr><td>2099-01-01</td><td>1</td><td>20</td></tr><tr><td>2026-01-02</td><td>unknown</td><td>-1</td></tr></table>';
add('afx_close_candidates',history);
const archive='<script>var wp_ajax = {"nse_id":12,"ajaxurl":"https://www.nse.co.ke/wp-admin/admin-ajax.php","ajaxnonce":"fixture","limit":10,"expiry":"fixture"};</script><button class="yearclick" data-year="2025" data-cid="12"></button><button class="yearclick" data-year="2014" data-cid="12"></button><button class="yearclick" data-year="2024" data-cid="99"></button><div class="nse_paginations"><div id="1"></div><div id="5"></div><div id="501"></div></div><div id="ajax-content-wrap"><h3>Audited report</h3><a href="/wp-content/uploads/report.pdf">Download</a><a href="https://other.example/a.pdf">Forbidden</a></div><a href="/corporate-actions/">Actions</a>';
for(const h of ['',archive]){add('archive_form_config',h);add('archive_page_numbers',h);add('archive_documents',h,'https://www.nse.co.ke/listed-company-announcements/',{archiveYear:2025});add('archive_category_links',h,'https://www.nse.co.ke/listed-company-announcements/');}
for(const url of ['https://www.nse.co.ke/corporate-actions#abc','https://www.nse.co.ke/report.pdf?year=2025'])add('canonical_archive_url',url);
add('kenyan_stock_links','<a href="/stock/nse/KPC">KPC</a><a href="/stock/nse/COOP">COOP</a><a href="https://other.example/stock/nse/KCB">No</a>');
add('kenyan_file_links','<div class="file-content"><h3>Annual report</h3><link itemprop="url" href="https://assets.kenyanstocks.com/report.pdf"><time datetime="2026-10-12"></time></div>','https://kenyanstocks.com/stock/nse/COOP');
const table='<table><tr><th>Metric</th><th>2025</th><th>2024</th></tr><tr class="group-header-row"><td>Group</td></tr><tr><td>Revenue</td><td>KES 100 B</td><td>KES 90 B</td></tr><tr><td>Total net income</td><td>20 B</td><td>19 B</td></tr></table>';
add('stock_tables',table,'Financials','Profit/Loss');add('stock_tables','<table><tr><th>Date</th><th>Open</th><th>Low</th><th>High</th><th>Close</th><th>Volume</th></tr><tr><td>12/10/26</td><td>36.6</td><td>36.5</td><td>37</td><td>36.6</td><td>126.28K</td></tr></table>','Historical Data',null);
add('html_financial_tables','<table><caption>Reported</caption><tr><th>Metric</th><th>2025</th><th>2024</th></tr><tr><td>Revenue</td><td>100</td><td>90</td></tr><tr><td>Net profit</td><td>20</td><td>(10)</td></tr></table>');
const root=fileURLToPath(new URL('../../scraper-python/',import.meta.url));
const program="import json,sys;sys.path.insert(0,sys.argv[1]);from continua_scraper import html,tables;ops={name:getattr(module,name) for module in (html,tables) for name in dir(module) if not name.startswith('_') and callable(getattr(module,name))};r=json.load(sys.stdin);print(json.dumps(ops[r['operation']](*r['args']),allow_nan=False,ensure_ascii=True))";
function compare(a,b,where){if(typeof a==='number'&&typeof b==='number'){if(Math.abs(a-b)>1e-8*Math.max(1,Math.abs(a)))throw Error('Numeric mismatch '+where);return;}if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){if(a!==b)throw Error('Value mismatch '+where);return;}if(JSON.stringify(Object.keys(a).sort())!==JSON.stringify(Object.keys(b).sort()))throw Error('Shape mismatch '+where);for(const k of Object.keys(a))compare(a[k],b[k],where+'.'+k);}
for(const item of cases){const expected=JSON.parse(JSON.stringify(operations[item.operation](...item.args)));const run=spawnSync(process.env.NATIVE_SCRAPER_PYTHON_BIN??'python3',['-c',program,root],{input:JSON.stringify(item),encoding:'utf8',timeout:10000,maxBuffer:4194304,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});if(run.status!==0)throw Error('Native source parser failed '+item.operation);compare(expected,JSON.parse(run.stdout),item.operation);}
console.log(JSON.stringify({nativeSourceParserComparisons:cases.length,passed:true,productionCutover:false}));
