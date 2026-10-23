import {describe,it,expect,vi} from 'vitest';import {EventEmitter} from 'node:events';
import {observePoolErrors} from './poolErrors.js';
describe('database disconnect handling',()=>{
 it('contains leased and idle connection errors without logging credentials or duplicating observers',()=>{
  const pool=new EventEmitter(),client=new EventEmitter(),report=vi.fn();observePoolErrors(pool,{component:'fixture-database',report});
  pool.emit('connect',client);pool.emit('connect',client);expect(client.listenerCount('error')).toBe(1);
  expect(()=>client.emit('error',Error('secret connection URI'))).not.toThrow();
  expect(()=>pool.emit('error',Error('secret query'))).not.toThrow();expect(report).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(report.mock.calls)).not.toContain('secret');
 });
});
