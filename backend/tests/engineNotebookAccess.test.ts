import {afterEach,expect,it,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
const mocks=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({query:mocks.query,withTransaction:mocks.transaction}));
vi.mock('../src/api/middleware/requireSubscriber.js',()=>({requirePremiumPlus:(req:any,res:any,next:any)=>{if(req.header('x-fixture-plan')!=='premium_plus')return res.status(403).json({error:'Plus required'});res.locals.engineUserId='fixture-owner';next();}}));
import {engineNotebookRoutes} from '../src/api/routes/engineNotebook.routes.js';
import {errorHandler} from '../src/api/middleware/errorHandler.js';
let server:Server|undefined;
afterEach(async()=>{vi.clearAllMocks();if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;});
async function start(){const app=express();app.use(express.json(),engineNotebookRoutes,errorHandler);server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});return `http://127.0.0.1:${(server.address() as {port:number}).port}`;}
it('protects the notebook with the Plus boundary and scopes reads to the verified owner',async()=>{
 mocks.query.mockResolvedValue({rows:[]});const url=await start();
 expect((await fetch(url+'/engine/notebook')).status).toBe(403);
 expect((await fetch(url+'/engine/notebook',{headers:{'x-fixture-plan':'premium'}})).status).toBe(403);
 expect(mocks.query).not.toHaveBeenCalled();
 expect((await fetch(url+'/engine/notebook',{headers:{'x-fixture-plan':'premium_plus'}})).status).toBe(200);
 expect(mocks.query.mock.calls[0]![1]).toEqual(['fixture-owner']);
});
it('locks owner-scoped rows and does not update another account or resolve early',async()=>{
 const client={query:vi.fn().mockResolvedValue({rows:[]})};mocks.transaction.mockImplementation(fn=>fn(client));const url=await start(),id='11111111-1111-4111-8111-111111111111';
 const post=(action:string,body:object)=>fetch(`${url}/engine/notebook/${id}/${action}`,{method:'POST',headers:{'content-type':'application/json','x-fixture-plan':'premium_plus'},body:JSON.stringify(body)});
 expect((await post('revise',{probability:.7,rationale:'Reviewed updated data'})).status).toBe(404);
 expect(client.query.mock.calls[0]![0]).toContain('WHERE id=$1 AND user_id=$2 FOR UPDATE');expect(client.query.mock.calls[0]![1]).toEqual([id,'fixture-owner']);
 client.query.mockResolvedValue({rows:[{id,status:'open',deadline:new Date(Date.now()+86400000).toISOString(),revisions:[]}]});
 expect((await post('resolve',{outcome:'yes',sourceUrl:'https://issuer.example/report',note:'Evidence meets the rules.'})).status).toBe(409);
 expect(client.query.mock.calls.every(c=>String(c[0]).startsWith('SELECT'))).toBe(true);
});
