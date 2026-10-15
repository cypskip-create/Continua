/** Source-layout goldens, including rejection parity. No database or provider calls. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
const {validateCondensedGroupReport}=await import('../../backend/src/ingestion/normalizers/condensedGroupReport.js');
const {validateSafaricomPressReport}=await import('../../backend/src/ingestion/normalizers/safaricomPressReport.js');
const {validateKakuziGroupReport}=await import('../../backend/src/ingestion/normalizers/kakuziGroupReport.js');
const {validateKcbGroupReport}=await import('../../backend/src/ingestion/normalizers/kcbGroupReport.js');
const {validateKakuziHtmlRecord}=await import('../../backend/src/ingestion/normalizers/kakuziHtmlRecord.js');
const {draftCbkBondReport}=await import('../../backend/src/ingestion/normalizers/cbkBondReport.js');
const read=name=>readFileSync(new URL(`../../backend/tests/${name}.test.ts`,import.meta.url),'utf8');
// Read literal fixture strings only, never execute TypeScript or eval input.
const literal=(source,name)=>{
 const match=source.match(new RegExp(`const ${name}=\x60([\\s\\S]*?)\x60;`));
 if(!match)throw new Error('Missing literal fixture');
 return match[1].replaceAll('\\t','\t').replaceAll('\\n','\n');
};
const condensedSource=read('condensedGroupReport');
const condensed=literal(condensedSource,'source').replaceAll('${header}',condensedSource.match(/const header='([^']+)';/)[1].replaceAll('\\t','\t').replaceAll('\\n','\n'));
const press=literal(read('safaricomPressReport'),'text');
const kakuzi=literal(read('kakuziGroupReport'),'text');
const kcbHeader=literal(read('kcbGroupReport'),'header');
const row=(label,a,b)=>`${label}  1  2  3  4  ${a}  ${b}`;
const kcb=[kcbHeader+'\n'+[
 row('21 TOTAL ASSETS','595,239,643','646,668,939'),row('34 TOTAL LIABILITIES','498,673,868','540,703,066'),row("43 TOTAL SHAREHOLDERS' FUNDS",'96,565,775','105,965,873')].join('\n'),kcbHeader+'\n'+[
 row('3 NET INTEREST INCOME/(LOSS)','47,026,644','48,384,773'),row('4.6 Total other operating income','22,450,006','23,000,810'),row('5 TOTAL OPERATING INCOME','69,476,650','71,385,583'),row('6.8 Total other operating expenses','40,385,525','42,271,381'),row('9 Profit/(loss) after exceptional items','29,091,125','29,114,202'),row('10 Current tax','(9,171,465)','(10,142,554)'),row('11 Deferred tax','(197,213)','733,483'),row('12 Profit/(loss) after tax and exceptional items','19,722,447','19,705,131'),row('18 EARNINGS PER SHARE- DILUTED & BASIC KSHS','6.43','6.43')].join('\n'),kcbHeader+'\naudited by\nKPMG-Kenya\nfinancial statements were approved by the Board of Directors on Wednesday, 7 March, 2018'].join('\f');
const fixtures=[
 ['draft_cbk_bond_report',draftCbkBondReport,literal(read('cbkBondReport'),'text'),['https://www.centralbank.go.ke/results.pdf'],[['12.7338 13.6016','12.7338'],['KE5000009984','KE6000001328'],['30 September 2026','30 September 2099'],['10-Jul-34','31-Feb-34']]],
 ['condensed_group_report',validateCondensedGroupReport,condensed,['Safaricom Plc','NSE:SCOM'],[['Group (KShs Mn)','Company (KShs Mn)'],['388,688.9','388,68O.9'],['230,921.1','231,921.1'],['(583.6)','(1,583.6)'],['6 May 2026','6 May 2099'],['1.74','174']]],
 ['safaricom_press_report',validateSafaricomPressReport,press,['2026-10-11'],[['163.36','163.3O'],['Kshs bn','Unknown units'],['31.87','41.87'],['31-Mar-15','31-Mar-14']]],
 ['kakuzi_group_report',validateKakuziGroupReport,kakuzi,['NSE:KUKZ'],[['KAKUZI PLC','Other Company'],['4,322,036','4,422,036'],['591,643','691,643'],['Shs’000','USD'],['2017 \t31 December 2016','2016 \t31 December 2017'],['22 March 2018','23 March 2018']]],
 ['kcb_group_report',validateKcbGroupReport,kcb,['NSE:KCB'],[['CONSOLIDATED','BANK'],['96,565,775','96,665,775'],['6.43','not reported'],['69,476,650','69,576,650'],['7 March, 2018','8 March, 2018']]],
];
let count=0;
function check(operation,oracle,args,shouldReject){
 let expected,rejected=false;
 try{expected=JSON.parse(JSON.stringify(oracle(...args)));}catch{rejected=true;}
 assert.equal(rejected,shouldReject,`${operation}: invalid test fixture`);
 const execution=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{
  input:JSON.stringify({operation,args}),encoding:'utf8',timeout:5000,maxBuffer:4194304,
  env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 assert.equal(execution.status!==0,rejected,`${operation}: rejection parity`);
 if(!rejected)assert.deepEqual(JSON.parse(execution.stdout),expected,`${operation}: statement/evidence parity`);
 count++;
}
for(const [operation,oracle,text,extra,mutations] of fixtures){
 for(const [source,shouldReject] of [[text,false],...mutations.map(([a,b])=>[text.replace(a,b),true])]){
  check(operation,oracle,[source,...extra],shouldReject);
 }
}
const htmlText="Five Year Record All amounts are stated in Kenyan shillings thousands (shs’000) except where otherwise indicated.";
const htmlTable={title:null,headerLine:" | 2025 Shs'000 | 2024 Shs'000 | 2023 Shs'000 | 2022 Shs'000 | 2021 Shs'000",method:'html_table_v1',confidence:.7,rows:[
 {label:'Turnover',values:['5,368,622','4,791,692','5,401,468','4,434,211','3,296,414']},
 {label:'(Loss)/Profit attributable to the members of Kakuzi Plc',values:['387,573','(131,694)','453,517','845,804','319,736']},
 {label:'Basic earnings per ordinary share (Shs)',values:['19.77','(6.72)','23.14','43.15','16.31']},
 {label:'Other comprehensive income',values:['3,955','1,322','2,114','-5,176','6,038']},
 {label:'Total comprehensive(Loss)/income',values:['391,528','(130,372)','455,631','840,628','325,774']}]};
for(const kind of ['valid','order','units','income','duplicate','eps','incomplete','numeric-parenthesis']){
 const t=structuredClone(htmlTable);
 if(kind==='order')t.headerLine=t.headerLine.replace('2025','2020');
 if(kind==='income')t.rows[1].values[0]='487,573';
 if(kind==='duplicate')t.rows.push(t.rows[0]);
 if(kind==='eps')t.rows[2].values[1]='6.72';
 if(kind==='incomplete')t.rows[0].values.pop();
 if(kind==='numeric-parenthesis')t.rows[1].values[1]='(-131,694)';
 check('kakuzi_html_record',validateKakuziHtmlRecord,[kind==='units'?htmlText.replace('Kenyan shillings','USD'):htmlText,[t],'NSE:KUKZ','2026-10-11'],kind!=='valid');
}
console.log(JSON.stringify({nativeReportParityCases:count,passed:true,productionCutover:false}));
