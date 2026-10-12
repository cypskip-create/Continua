import dotenv from 'dotenv';
dotenv.config({path:'../backend/.env.local',quiet:true});
dotenv.config({quiet:true});
const {pool,query}=await import('../src/storage/db.js');
const {kenyanstocksAdapter}=await import('../src/adapters/kenyanstocks/kenyanstocksAdapter.js');
const {enqueueDocuments}=await import('../src/storage/documentJobsRepository.js');
const {runAdapter}=await import('../src/adapters/runAdapter.js');
const {closeBrowser}=await import('../src/crawler/renderWithBrowser.js');
const {stockTabDocuments}=await import('../src/adapters/kenyanstocks/tabPlan.js');
try{
 const source=(await query("SELECT enabled,redistribution_allowed FROM scraping.sources WHERE id='kenyanstocks'")).rows[0];
 if(!source?.enabled||source.redistribution_allowed!==true)throw new Error('Enabled source and operator-confirmed publisher permission required');
 const sample=process.argv.find(v=>v.startsWith('--sample-stock='))?.split('=')[1];
 if(sample){
  if(!/^[A-Z0-9-]{1,20}$/.test(sample))throw new Error('Sample ticker must match an observed publisher stock');
  const known=await query("SELECT 1 FROM scraping.document_jobs WHERE source_id='kenyanstocks' AND document->'context'->>'ticker'=$1 LIMIT 1",[sample]);
  if(!known.rowCount)throw new Error('Sample issuer was not discovered on the publisher');
  console.log(JSON.stringify(await runAdapter({...kenyanstocksAdapter,persistentBatchSize:undefined,discover:async()=>stockTabDocuments(`https://kenyanstocks.com/stock/nse/${sample}`)})));
 }else if(process.argv.includes('--discover-only')){
  const documents=await kenyanstocksAdapter.discover();await enqueueDocuments('kenyanstocks',documents);
  console.log(JSON.stringify({stocks:new Set(documents.map(d=>d.context?.ticker)).size,views:documents.length}));
 }else{
  const batches=Number(process.argv.find(v=>v.startsWith('--batches='))?.split('=')[1]??1);
  if(!Number.isInteger(batches)||batches<1||batches>100)throw new Error('Batches must be 1..100');
  const adapter=process.argv.includes('--drain-only')?{...kenyanstocksAdapter,discover:async()=>[]}:kenyanstocksAdapter;
  for(let i=0;i<batches;i++){const result=await runAdapter(adapter);console.log(JSON.stringify({batch:i+1,...result}));if(!result.fetched&&!result.failed)break;}
 }
 console.log(JSON.stringify({jobs:(await query("SELECT status,count(*)::int AS count FROM scraping.document_jobs WHERE source_id='kenyanstocks' GROUP BY status")).rows}));
}catch(error){console.error(JSON.stringify({error:(error as Error).message}));process.exitCode=1;}
finally{await closeBrowser();await pool.end();}
