const hashPattern=/^[a-f0-9]{64}$/;
const integerPattern=/^(?:0|[1-9][0-9]*)$/;
function normalizedPath(value){
 if(typeof value!=='string'||value.length>1024)throw Error('Invalid source object path');
 const result=value.replaceAll('\\','/');
 if(result.split('/').some(part=>!part||part==='.'||part==='..'||/[\x00-\x1f]/.test(part)))throw Error('Unsafe source object path');
 return result;
}

// Never infer content identity from a filename alone. This is a dry-run plan;
// unresolved database references must be reconciled before a final cutover.
export function planStorageReferences(artifacts,ledger,{bucket='continua-financial-documents',recovered=[]}={}){
 if(bucket!=='continua-financial-documents'||!Array.isArray(artifacts)||!Array.isArray(ledger)||!Array.isArray(recovered)||artifacts.length>100000||ledger.length>100000||recovered.length>100000)throw Error('Invalid storage reference inventory');
 const verified=new Map(),recoveries=new Map(),artifactIds=new Set(),updates=[],unresolved=[];
 for(const entry of recovered){
  if(entry.verified!==true||!hashPattern.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>67108864||!Array.isArray(entry.artifactIds)||!entry.artifactIds.length||!new RegExp('^migration/legacy-raw/'+entry.sha256+'\\.(?:html|bin|pdf)$').test(entry.key))throw Error('Invalid recovered raw-object proof');
  for(const id of entry.artifactIds){if(!integerPattern.test(String(id))||recoveries.has(String(id)))throw Error('Duplicate or invalid recovery binding');recoveries.set(String(id),entry);}
 }
 for(const entry of ledger){
  if(entry.bucket!=='scraper-raw')continue;
  const name=normalizedPath(entry.name),ext=name.split('.').at(-1).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12)||'bin';
  if(entry.verified!==true||!hashPattern.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>67108864||entry.key!==`migration/supabase/scraper-raw/${entry.sha256}.${ext}`)throw Error('Unverified or unsafe target reference');
  if(verified.has(name))throw Error('Duplicate source ledger path');
  verified.set(name,entry);
 }
 for(const row of artifacts){
  if(!integerPattern.test(String(row.id))||artifactIds.has(String(row.id)))throw Error('Duplicate or invalid artifact identity');
  artifactIds.add(String(row.id));
  if(typeof row.storage_path!=='string')throw Error('Missing artifact location');
  if(row.storage_path.startsWith('r2://'))continue;
  const name=normalizedPath(row.storage_path),entry=verified.get(name)??recoveries.get(String(row.id));
  if(!entry){unresolved.push({id:String(row.id),reason:'NO_VERIFIED_SNAPSHOT_OBJECT'});continue;}
  if(!hashPattern.test(row.sha256)||entry.sha256!==row.sha256||!integerPattern.test(String(row.size_bytes))||BigInt(row.size_bytes)!==BigInt(entry.bytes))throw Error('Source database and verified object disagree');
  updates.push({id:String(row.id),originalPath:row.storage_path,sha256:row.sha256,bytes:String(row.size_bytes),target:`r2://${bucket}/${entry.key}`});
 }
 return {updates,unresolved,ready:unresolved.length===0};
}
