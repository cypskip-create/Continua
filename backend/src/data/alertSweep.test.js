import {describe,it,expect,vi} from 'vitest';
import {indicatorDecision,runOwnedAlertSweep} from './alertSweep.js';

describe('owned scheduled alert decisions',()=>{
 it('preserves RSI thresholds and rejects missing/nonfinite series',()=>{
  const alert={indicator:'RSI',alert_type:'rsi_above',indicator_params:{period:14,threshold:70}};
  expect(indicatorDecision(alert,[[null,70]])).toContain('above 70');
  expect(indicatorDecision(alert,[[null,69]])).toBeNull();
  expect(indicatorDecision(alert,[[null,null]])).toBeNull();
  expect(indicatorDecision(alert,[[NaN]])).toBeNull();
 });
 it('requires an actual aligned crossover in the requested direction',()=>{
  const alert={indicator:'EMA_CROSS',indicator_params:{fastPeriod:10,slowPeriod:30,direction:1}};
  expect(indicatorDecision(alert,[[1,3],[2,2]])).toBe('EMA(10) crossed bullish through EMA(30)');
  expect(indicatorDecision(alert,[[3,4],[2,2]])).toBeNull();
  expect(indicatorDecision(alert,[[1,3],[2]])).toBeNull();
  expect(indicatorDecision({...alert,indicator_params:{direction:-1}},[[3,1],[2,2]])).toContain('bearish');
 });
 it('uses SQL price comparisons and original decimal text, with atomic delivery',async()=>{
  const calls=[];const client={release:vi.fn(),query:vi.fn(async(sql,args)=>{calls.push([sql,args]);
   if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};
   if(sql.includes('FROM public.price_alerts'))return {rows:[{id:'alert',user_id:'owner',symbol:'SCOM',exchange:'NSE',currency:'KES',alert_type:'price_above',target_value:'1.000000000000000001',updated_at:'2026-10-22T00:00:00Z'}]};
   if(sql.includes('FROM market.live_quotes'))return {rows:[{price:'1.000000000000000002',triggered:true}]};
   if(sql.includes('deliver_alert_notification'))return {rows:[{delivered:true}]};
   return {rows:[]};})};
  const result=await runOwnedAlertSweep({database:{connect:async()=>client},computeIndicator:()=>{throw Error('No indicator required');}});
  expect(result.triggered).toBe(1);expect(calls.find(([sql])=>sql.includes('FROM market.live_quotes'))[0]).toContain('$4::numeric');
  expect(calls.find(([sql])=>sql.includes('deliver_alert_notification'))[1][2]).toContain('1.000000000000000002');
  expect(calls.at(-1)[0]).toBe('COMMIT');expect(client.release).toHaveBeenCalledOnce();
 });
 it('skips overlapping sweeps and rolls back failed deliveries',async()=>{
  const query=vi.fn(async sql=>({rows:sql.includes('pg_try_advisory')?[{locked:false}]:[]})),release=vi.fn();
  const result=await runOwnedAlertSweep({database:{connect:async()=>({query,release})},computeIndicator:vi.fn()});
  expect(result.skipped).toBe(true);expect(query).toHaveBeenCalledWith('ROLLBACK');expect(release).toHaveBeenCalledOnce();
  query.mockImplementation(async sql=>{if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};if(sql.includes('FROM public.price_alerts'))throw Error('database unavailable');return {rows:[]};});
  await expect(runOwnedAlertSweep({database:{connect:async()=>({query,release})},computeIndicator:vi.fn()})).rejects.toThrow('database unavailable');
  expect(query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
 });
});
