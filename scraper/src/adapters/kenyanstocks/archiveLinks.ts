import * as cheerio from 'cheerio';
import type {SourceDocument} from '../types.js';
export function kenyanStockLinks(html:string):string[] {
 const $=cheerio.load(html),links=new Set<string>();
 $('a[href]').each((_,n)=>{try{const u=new URL($(n).attr('href')!,'https://kenyanstocks.com');if(u.origin==='https://kenyanstocks.com'&&/^\/stock\/nse\/[A-Z0-9-]+$/.test(u.pathname))links.add(u.href);}catch{}});
 return [...links];
}
export function kenyanFileLinks(html:string,pageUrl:string):SourceDocument[] {
 const $=cheerio.load(html),docs=new Map<string,SourceDocument>();
 $('.file-content').each((_,n)=>{
  const block=$(n),href=block.find('link[itemprop="url"]').attr('href');if(!href)return;
  try{const u=new URL(href);if(u.protocol!=='https:'||u.hostname!=='assets.kenyanstocks.com'||!u.pathname.endsWith('.pdf')||u.username||u.password)return;
   docs.set(u.href,{url:u.href,title:block.find('h3').text().trim(),discoveredFrom:pageUrl,context:{mirror:true,publisher:'KenyanStocks',listingUploadedAt:block.find('time').attr('datetime')??null}});
  }catch{}
 });return [...docs.values()];
}
