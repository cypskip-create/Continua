import * as cheerio from 'cheerio';
import {getSource} from '../../storage/sourcesRepository.js';
import {fetchWithRetry} from '../../crawler/httpClient.js';
import {isAllowedByRobots} from '../../crawler/robotsCheck.js';
import {sha256} from '../../crawler/hash.js';
import {storeRawArtifact} from '../../storage/rawStorage.js';
import {upsertArtifact} from '../../storage/rawArtifactsRepository.js';
import type {SourceAdapter} from '../types.js';
const id='afx-company-history';
export function afxProfileFacts(html:string) {
 const $=cheerio.load(html),facts:Record<string,string>={};
 const block=$('[data-fact]');
 block.find('dt').each((_,n)=>{const label=$(n).text().trim().toLowerCase(),value=$(n).next('dd').text().trim();if(['sector','industry','address','website'].includes(label)&&value)facts[label]=value;});
 const companyName=block.find('h3').text().replace(/^Factsheet of\s+/i,'').trim();
 return companyName&&Object.keys(facts).length?{kind:'publisher_profile',companyName,facts}:null;
}
export function afxCloseCandidates(html:string) {
 const $=cheerio.load(html),rows:{kind:string;date:string;close:number;volume:number|null;basis:string}[]=[];
 $('table').each((_,t)=>{
  if(!/date/i.test($(t).find('tr').first().text())||!/volume/i.test($(t).find('tr').first().text())||!/close/i.test($(t).find('tr').first().text()))return;
  $(t).find('tr').slice(1).each((_,n)=>{
   const c=$(n).find('td').map((_,cell)=>$(cell).text().trim()).get(),date=c[0],close=Number(c[2]?.replace(/,/g,'')),volume=c[1]?.replace(/,/g,'');
   if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>new Date().toISOString().slice(0,10)||!Number.isFinite(close)||close<=0)return;
   rows.push({kind:'historical_close_candidate',date,close,volume:volume&&/^\d+$/.test(volume)?Number(volume):null,basis:'Publisher daily close only; no open, high or low supplied. Not canonical until source/reconciliation review.'});
  });
 });return rows;
}
export const afxAdapter:SourceAdapter={id,documentConcurrency:1,persistentBatchSize:10,
 async discover(){
  const source=await getSource(id), url='https://afx.kwayisi.org/nse/';
  if(!await isAllowedByRobots(url))return [];
  const res=await fetchWithRetry(url,{requestsPerSecond:source?.config.requestsPerSecond??.2});
  if(res.status!==200)throw new Error(`AFX listing HTTP ${res.status}`);
  const $=cheerio.load(res.body.toString()),links=new Map<string,{url:string;discoveredFrom:string;context:{ticker:string}}>();
  $('a[href]').each((_,n)=>{try{const u=new URL($(n).attr('href')!,url),m=/^\/nse\/([a-z0-9-]+)\.html$/.exec(u.pathname);if(u.origin==='https://afx.kwayisi.org'&&m)links.set(u.href,{url:u.href,discoveredFrom:url,context:{ticker:m[1]!.toUpperCase()}});}catch{}});
  return [...links.values()];
 },
 async fetch(document){
  if(!await isAllowedByRobots(document.url))throw new Error('AFX robots disallows collection');
  const res=await fetchWithRetry(document.url,{requestsPerSecond:.2});if(res.status!==200)throw new Error(`AFX HTTP ${res.status}`);
  const hash=sha256(res.body),contentType='text/html',storagePath=await storeRawArtifact({sourceId:id,sha256:hash,contentType,body:res.body});
  const {artifact,isNew}=await upsertArtifact({sourceId:id,adapter:'afx',sha256:hash,documentUrl:res.finalUrl,sourceUrl:document.discoveredFrom,contentType,sizeBytes:res.body.length,storagePath,crawlerVersion:'afx-observed-profile-v1',metadata:document.context});
  return {document,sha256:hash,contentType,sizeBytes:res.body.length,storagePath,body:res.body,isNewArtifact:isNew,artifactId:artifact.id};
 },
 async parse(fetched){
  const html=fetched.body.toString(),$=cheerio.load(html),profile=afxProfileFacts(html);
  $('script,style,nav,footer,#comments').remove();
  return {method:'html',confidence:profile?.companyName?.length ? .8 : .3,text:$('body').text().trim(),tables:[...(profile?[profile]:[]),...afxCloseCandidates(html)],
   entity:{companyName:profile?.companyName??null,ticker:typeof fetched.document.context?.ticker==='string'?fetched.document.context.ticker:null,exchange:'NSE'},needsReview:true};
 }
};
