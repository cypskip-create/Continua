import {it,expect,vi} from 'vitest';
import express from 'express';
import {createServer} from 'node:http';
vi.mock('../src/api/controllers/financials.controller.js',()=>({financialsController:{getLatest:vi.fn(),getHistory:vi.fn()}}));
vi.mock('../src/services/research/publisherFinancialTables.js',()=>({publisherFinancialTables:vi.fn()}));
vi.mock('../src/storage/repositories/securitiesRepository.js',()=>({securitiesRepository:{getBySymbol:vi.fn(async()=>({symbol:'KCB'}))}}));
vi.mock('../src/services/research/collectedResearch.js',()=>({collectedResearch:vi.fn(),researchDestinations:new Set(['financials'])}));
import {financialsRoutes} from '../src/api/routes/financials.routes.js';
import {errorHandler} from '../src/api/middleware/errorHandler.js';
import {collectedResearch} from '../src/services/research/collectedResearch.js';

it('reports private storage failures as retryable unavailability without disclosing provider details',async()=>{
    collectedResearch.mockRejectedValue(new Error('fixture-only private provider details'));
    const app=express();app.use('/api/v1',financialsRoutes);app.use(errorHandler);
    const server=createServer(app);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
        const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/financials/KCB/collected-research`);
        expect(response.status).toBe(503);expect(response.headers.get('Retry-After')).toBe('30');
        expect(await response.json()).toEqual({error:'Collected research temporarily unavailable'});
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
