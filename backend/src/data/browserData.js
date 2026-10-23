import {readFileSync} from 'node:fs';
const contract=JSON.parse(readFileSync(new URL('./browserTables.json',import.meta.url),'utf8'));
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const maximumRows=1000;
export class DataRequestError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function compileDataRequest({table,method,search=new URLSearchParams(),body,prefer=''}) {
 const columns=Object.hasOwn(contract,table)?contract[table]:null;if(!columns)throw new DataRequestError('Unknown data resource',404);
 if(table==='profiles_public'&&!['GET','HEAD'].includes(method))throw new DataRequestError('Public profile resource is read-only',405);
 if(!['GET','HEAD','POST','PATCH','DELETE'].includes(method))throw new DataRequestError('Method unavailable',405);
 const column=value=>{if(!columns.includes(value))throw new DataRequestError('Unknown column');return quote(value);};
 const params=[],bind=value=>{params.push(value);return '$'+params.length;};
 const selection=search.get('select')??'*';const selected=selection==='*'?'*':selection.split(',').map(v=>column(v.trim())).join(',');if(!selected)throw new DataRequestError('Empty selection');const returning=prefer.includes('return=representation')?selected:'1 AS affected';
 for(const key of ['select','order','limit','offset','on_conflict'])if(search.getAll(key).length>1)throw new DataRequestError('Repeated query option');
 function predicate(name,expression){const c=column(name),dot=expression.indexOf('.');const operator=expression.slice(0,dot),value=expression.slice(dot+1);if(dot<1)throw new DataRequestError('Invalid filter');const op={eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',like:'LIKE',ilike:'ILIKE'}[operator];if(op)return c+' '+op+' '+bind(value);if(operator==='is'&&['null','true','false'].includes(value))return c+' IS '+value.toUpperCase();if(operator==='in'&&value.startsWith('(')&&value.endsWith(')')){const values=value.slice(1,-1);if(!values)return 'false';// Quoted PostgREST values may contain commas; parse that supported grammar explicitly.
 const parts=[];let part='',quoted=false;for(let i=0;i<values.length;i++){const ch=values[i];if(ch==='"'){quoted=!quoted;continue;}if(ch==='\\'&&quoted){if(i+1>=values.length)throw new DataRequestError('Invalid list escape');part+=values[++i];continue;}if(ch===','&&!quoted){parts.push(part);part='';}else part+=ch;}if(quoted)throw new DataRequestError('Unclosed list value');parts.push(part);if(parts.length>1000)throw new DataRequestError('Filter list too large');return c+' IN ('+parts.map(bind).join(',')+')';}throw new DataRequestError('Unsupported filter');}
 const filters=[];for(const [name,value] of search){if(['select','order','limit','offset','on_conflict'].includes(name))continue;if(name==='or'){if(!value.startsWith('(')||!value.endsWith(')'))throw new DataRequestError('Invalid alternative filter');const alternatives=value.slice(1,-1).split(',');if(alternatives.length>10)throw new DataRequestError('Too many alternative filters');filters.push('('+alternatives.map(item=>{const dot=item.indexOf('.');return predicate(item.slice(0,dot),item.slice(dot+1));}).join(' OR ')+')');}else filters.push(predicate(name,value));}
 const where=filters.length?' WHERE '+filters.join(' AND '):'';
 const relation='public.'+quote(table);let sql,countSql;const countParams=[...params];
 if(method==='GET'||method==='HEAD'){
  let order='';if(search.has('order')){const terms=search.get('order').split(',');if(terms.length>8)throw new DataRequestError('Too many sort columns');order=' ORDER BY '+terms.map(term=>{const pieces=term.split('.');if(pieces.length>3)throw new DataRequestError('Invalid sort');const [name,direction='asc',nulls]=pieces;if(!['asc','desc'].includes(direction)||(nulls&&!['nullsfirst','nullslast'].includes(nulls)))throw new DataRequestError('Invalid sort');return column(name)+' '+direction.toUpperCase()+(nulls?' NULLS '+(nulls==='nullsfirst'?'FIRST':'LAST'):'');}).join(',');}
  const limit=Number(search.get('limit')??maximumRows),offset=Number(search.get('offset')??0);if(!Number.isSafeInteger(limit)||limit<0||limit>maximumRows||!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new DataRequestError('Invalid pagination');
  sql=`SELECT ${selected} FROM ${relation}${where}${order} LIMIT ${bind(limit)} OFFSET ${bind(offset)}`;
  if(prefer.split(',').some(value=>value.trim()==='count=exact'))countSql=`SELECT count(*)::text count FROM ${relation}${where}`;
 }else if(method==='POST'){
  if(filters.length)throw new DataRequestError('Insert filters are not supported');
  const rows=Array.isArray(body)?body:[body];if(!rows.length||rows.length>100)throw new DataRequestError('Invalid insert batch');const keys=Object.keys(rows[0]??{});if(!keys.length)throw new DataRequestError('Empty insert');keys.forEach(column);for(const row of rows)if(!row||Array.isArray(row)||typeof row!=='object'||Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))throw new DataRequestError('Inconsistent insert fields');
  const values=rows.map(row=>'('+keys.map(key=>bind(row[key])).join(',')+')').join(',');sql=`INSERT INTO ${relation} (${keys.map(column).join(',')}) VALUES ${values}`;
  if(prefer.includes('resolution=')){
   const conflict=(search.get('on_conflict')??'').split(',').filter(Boolean);if(!conflict.length)throw new DataRequestError('Explicit conflict columns required');conflict.forEach(column);
   sql+=' ON CONFLICT ('+conflict.map(column).join(',')+')';
   if(prefer.includes('resolution=ignore-duplicates'))sql+=' DO NOTHING';else if(prefer.includes('resolution=merge-duplicates')){const changed=keys.filter(key=>!conflict.includes(key));sql+=changed.length?' DO UPDATE SET '+changed.map(key=>column(key)+'=EXCLUDED.'+column(key)).join(','):' DO NOTHING';}else throw new DataRequestError('Unknown conflict behavior');
  }
  sql+=' RETURNING '+returning;
 }else{
  if(!filters.length)throw new DataRequestError('Explicit mutation filter required');
  if(method==='PATCH'){if(!body||Array.isArray(body)||typeof body!=='object'||!Object.keys(body).length)throw new DataRequestError('Invalid update');sql=`UPDATE ${relation} SET `+Object.entries(body).map(([name,value])=>column(name)+'='+bind(value)).join(',')+where;}
  else sql=`DELETE FROM ${relation}${where}`;
  sql+=' RETURNING '+returning;
 }
 return {sql:`WITH result AS (${sql}) SELECT row_to_json(result)::text payload FROM result`,params,countSql,countParams,head:method==='HEAD',mutation:!['GET','HEAD'].includes(method),representation:prefer.includes('return=representation')};
}

// Caller supplies only claims returned by server-side access verification.
// Each operation sets LOCAL role/claims and releases a clean connection.
export async function executeDataRequest(pool,compiled,verifiedClaims){
 // Send constant transaction setup together, avoiding two cross-region trips.
 // Claims remain parameter-bound, and the live guard still precedes every read.
 const client=await pool.connect();try{await client.query(verifiedClaims?"BEGIN; SET LOCAL statement_timeout='8000ms'; SET LOCAL ROLE authenticated":"BEGIN; SET LOCAL statement_timeout='8000ms'; SET LOCAL ROLE anon");await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(verifiedClaims??{})]);if(verifiedClaims)await client.query('SELECT public.continua_session_guard()');
 const count=compiled.countSql?(await client.query(compiled.countSql,compiled.countParams)).rows[0].count:undefined;
 // HEAD needs headers only; do not fetch and serialize rows after its count.
 const result=compiled.head?{rows:[]}:await client.query(compiled.sql,compiled.params);const payload='['+result.rows.map(row=>row.payload).join(',')+']';if(Buffer.byteLength(payload)>4*1024*1024)throw new DataRequestError('Result too large; paginate this request',413);await client.query('COMMIT');return {json:payload,count,rows:result.rows.length};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
