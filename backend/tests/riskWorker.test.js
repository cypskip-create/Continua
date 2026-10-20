import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('../src/config/index.js',()=>({env:{LOG_LEVEL:'silent',NODE_ENV:'test',ENGINE_PYTHON_BIN:process.env.ENGINE_PYTHON_BIN??'python3'}}));
import {pythonCalculation} from '../src/services/research/pythonCalculations.js';
const test=process.env.ENGINE_PYTHON_PARITY==='true'?it:it.skip;
test('runs the packaged shared model through the real secret-free worker',async()=>{
 const snapshot=JSON.parse(readFileSync(new URL('../../app/tests/fixtures/risk-test-snapshot.json',import.meta.url),'utf8'));
 const result=await pythonCalculation('risk_simulation',[snapshot,{scenario:{marketShock:-.2}}]);
 expect(result.status).toBe(200);expect(result.data.current.pnl).toBeCloseTo(-200);
 expect(result.data.current.stressedValue).toBeCloseTo(800);
 const rejected=await pythonCalculation('risk_simulation',[snapshot,{userId:'forged'}]);
 expect(rejected.status).toBe(400);
});
