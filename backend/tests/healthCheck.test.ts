import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({ping:vi.fn(),query:vi.fn(),open:vi.fn(),warn:vi.fn(),error:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({pool:{query:m.ping},query:m.query}));
vi.mock('../src/storage/cache.js',()=>({cache:{set:vi.fn(),get:vi.fn().mockResolvedValue('pong')}}));
vi.mock('../src/config/tradingCalendar.js',()=>({isMarketOpen:m.open}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{warn:m.warn,error:m.error}}));
import {runHealthCheck} from '../src/monitoring/healthCheck.js';
describe('market-aware health',()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-11T14:00:00Z'));vi.clearAllMocks();m.ping.mockResolvedValue({});m.query.mockResolvedValue({rows:[{total:'69',stale:'69'}]});});
 afterEach(()=>vi.useRealTimers());
 it('does not treat closed-market quote age as a server failure',async()=>{
  m.open.mockReturnValue(false);const h=await runHealthCheck();expect(h.status).toBe('healthy');expect(h.checks.quoteFreshness?.detail).toContain('NSE closed');expect(m.error).not.toHaveBeenCalled();
 });
 it('still detects stale data during market hours, without claiming the database failed',async()=>{
  vi.advanceTimersByTime(6000);m.open.mockReturnValue(true);const h=await runHealthCheck();expect(h.status).toBe('degraded');expect(m.warn).toHaveBeenCalled();expect(m.error).not.toHaveBeenCalled();
 });
 it('deduplicates concurrent probes and reports database outages',async()=>{
  vi.advanceTimersByTime(12000);m.ping.mockRejectedValue(new Error('unavailable'));const values=await Promise.all([runHealthCheck(),runHealthCheck()]);expect(m.ping).toHaveBeenCalledTimes(1);expect(values[0].status).toBe('unhealthy');expect(m.error).toHaveBeenCalled();
 });
});
