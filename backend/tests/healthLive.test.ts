import {it,expect,vi} from 'vitest';
const health=vi.hoisted(()=>vi.fn());
vi.mock('../src/monitoring/healthCheck.js',()=>({runHealthCheck:health}));
import {healthController} from '../src/api/controllers/health.controller.js';
it('liveness never waits for a database, quote or ingestion job',async()=>{
 const response={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};response.status.mockReturnValue(response);
 health.mockRejectedValue(new Error('database unavailable'));
 await healthController.live({} as any,response as any);
 expect(health).not.toHaveBeenCalled();expect(response.status).toHaveBeenCalledWith(200);
 expect(response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
 expect(response.json).toHaveBeenCalledWith(expect.objectContaining({status:'alive',implementation:'javascript'}));
});
