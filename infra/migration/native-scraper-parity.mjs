/** Pure publisher discovery contracts; no browser/network/database writes. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stockTabDocuments} from '../../scraper/src/adapters/kenyanstocks/tabPlan.js';
const root=fileURLToPath(new URL('../../scraper-python',import.meta.url));
const python=process.env.NATIVE_PYTHON_BIN??'python3';
const program='import json,sys;sys.path.insert(0,sys.argv[1]);from continua_scraper.tabs import stock_tab_documents;print(json.dumps(stock_tab_documents(*json.load(sys.stdin))))';
const cases=[['https://kenyanstocks.com/stock/nse/COOP'],['https://kenyanstocks.com/stock/nse/COOP?tab=Files#section'],['https://kenyanstocks.com/stock/nse/DTK',['Summary','Financials','New Information'],['Profit/Loss','Assets']],['https://kenyanstocks.com/stock/nse/KPC',['Summary','Summary','New Information','Invalid<script>']],['https://evil.test/stock/nse/COOP'],['https://kenyanstocks.com/stock/nse/coop']];
for(const args of cases){const expected=stockTabDocuments(...args);const execution=spawnSync(python,['-c',program,root],{input:JSON.stringify(args),encoding:'utf8',timeout:5000,windowsHide:true,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});if(execution.status!==0)throw new Error('Native tab planner failed');if(JSON.stringify(JSON.parse(execution.stdout))!==JSON.stringify(expected))throw new Error('Publisher tab discovery contract differs');}
console.log(JSON.stringify({nativeScraperParityCases:cases.length,passed:true,networkRequests:false}));
