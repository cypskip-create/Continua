import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(()=>({query:vi.fn(),tx:{query:vi.fn()}}));
vi.mock("../src/storage/db.js",()=>({query:db.query,withTransaction:(fn:(client:typeof db.tx)=>unknown)=>fn(db.tx)}));
import {newsRepository} from "../src/storage/repositories/newsRepository.js";
import {clearStockMentionDirectoryCache} from "../src/ingestion/entityResolution/resolveStockMentions.js";
const directory=[{securityId:"kq",symbol:"KQ",companyName:"Kenya Airways PLC"},{securityId:"kcb",symbol:"KCB",companyName:"KCB Group PLC"},{securityId:"scom",symbol:"SCOM",companyName:"Safaricom PLC"}];
const legacy={id:"1",headline:"Passenger Dies on Kenya Airways Flight to Lagos",excerpt:"Kenya Airways said a passenger died on its flight to Lagos.",matchingText:"Kenya Airways said a passenger died on its flight to Lagos.\nRelated stories\nKCB Bank and Safaricom announce new business results.",articleUrl:"https://example.invalid/flight",source:"publisher",sourceName:"Publisher",category:"companies",imageUrl:null,scrapedArtifactId:1,scrapedExtractionId:1,extractionConfidence:"0.6",needsReview:false,publishedAt:"2026-10-07",securityIds:["kcb","scom"],symbols:["KCB","SCOM"]};
beforeEach(()=>{vi.clearAllMocks();clearStockMentionDirectoryCache();db.tx.query.mockResolvedValue({rows:[]});db.query.mockImplementation(async(sql:string)=>({rows:sql.includes('FROM market.securities s JOIN')?directory:[legacy]}));});
it("revalidates legacy tags on reader and feed responses",async()=>{
  const reader=await newsRepository.getById("1");
  expect(reader?.symbols).toEqual(["KQ"]);
  expect(reader?.relevance?.evidence[0]).toMatchObject({symbol:"KQ",basis:"headline"});
  expect((await newsRepository.listRecent())[0]?.symbols).toEqual(["KQ"]);
});
it("does not leak wrong associations into portfolio/stock news",async()=>{
  expect(await newsRepository.listBySecurity("kcb")).toEqual([]);
  expect((await newsRepository.listBySecurity("kq"))[0]?.symbols).toEqual(["KQ"]);
});
it("repairs stored associations without deleting articles or editing their date",async()=>{
  expect(await newsRepository.revalidateBatch()).toEqual({processed:1,corrected:1,lastId:"1"});
  expect(db.tx.query.mock.calls.some(([sql])=>sql.includes('DELETE FROM market.news_item_securities'))).toBe(true);
  expect(db.tx.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO market.news_item_securities'))?.[1]).toEqual(["1","kq"]);
  expect(db.tx.query.mock.calls.some(([sql])=>sql.includes('DELETE FROM market.news_items')||sql.includes('published_at'))).toBe(false);
});
it("does not erase associations when the issuer directory is unavailable",async()=>{
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes('FROM market.securities s JOIN')?[]:[legacy]}));
  await expect(newsRepository.revalidateBatch()).rejects.toThrow('securities directory');
  expect(db.tx.query).not.toHaveBeenCalled();
});
