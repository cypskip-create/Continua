import {describe,it,expect} from 'vitest';
import express from 'express';
import {createServer} from 'node:http';
import {createMaintenanceRouter} from './maintenanceRoutes.js';

describe('private application maintenance route',()=>{
 it('rejects user and browser authority; accepts only its dedicated key',async()=>{
  const secret='test-only-maintenance-'.repeat(3),calls=[];
  const app=express();app.use(createMaintenanceRouter({secret,now:()=>300000,run:async options=>{calls.push(options);return {enabled:true};}}));
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/application-jobs`;
  try{
   expect((await fetch(url,{method:'POST',headers:{'X-User-Token':'user','X-API-Key':'server'}})).status).toBe(401);
   expect((await fetch(url,{method:'POST',headers:{'X-Continua-Maintenance-Key':secret,Origin:'https://continua.example'}})).status).toBe(401);
   const response=await fetch(url,{method:'POST',headers:{'X-Continua-Maintenance-Key':secret}});
   expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(calls).toEqual([{sweep:true}]);
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
});
