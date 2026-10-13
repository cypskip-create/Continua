import {it,expect,vi} from 'vitest';
const config=vi.hoisted(()=>({ENGINE_PYTHON_BIN:process.env.ENGINE_PYTHON_BIN??'python3',ENGINE_CALCULATION_RUNTIME:'python'}));
vi.mock('../src/config/index.js',()=>({env:config}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{error:vi.fn(),warn:vi.fn()}}));
import {pythonCalculation} from '../src/services/research/pythonCalculations.js';
import {stressPortfolio,bondRisk,futuresRisk} from '../src/services/research/engineRiskLab.js';
import {earningsSensitivity} from '../src/services/research/earningsSensitivity.js';
function parity(actual:unknown,expected:unknown) {
 if(typeof expected==='number'){expect(typeof actual).toBe('number');expect(Math.abs((actual as number)-expected)).toBeLessThanOrEqual(Math.max(1e-7,Math.abs(expected)*1e-7));}
 else if(Array.isArray(expected)){expect(Array.isArray(actual)).toBe(true);expect((actual as unknown[]).length).toBe(expected.length);expected.forEach((v,i)=>parity((actual as unknown[])[i],v));}
 else if(expected&&typeof expected==='object'){expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected).sort());for(const [k,v] of Object.entries(expected))parity((actual as Record<string,unknown>)[k],v);}
 else expect(actual).toEqual(expected);
}
// Real Python process tests are opt-in on environments without Python installed.
const test=process.env.ENGINE_PYTHON_PARITY==='true'?it:it.skip;
test.each([-0.5,0,0.25])('matches stress arithmetic and metadata for %s',async shock=>{
 const positions=[{symbol:'KCB',sector:'Banking',value:100000,asOf:'2026-10-12'},{symbol:'SCOM',sector:'Telecom',value:70000,asOf:null}];
 parity(await pythonCalculation('stress',[positions,shock,{Banking:-.1}]),stressPortfolio(positions,shock,{Banking:-.1}));
 parity(await pythonCalculation('stress',[[],shock,{}]),stressPortfolio([],shock,{}));
});
test.each(['long','short'] as const)('matches %s futures and zero-margin null',async side=>{
 const input={entry:95,settlement:105,multiplier:100,contracts:3,side,margin:0,expiry:'2026-10-13',asOf:'2026-10-12',shockPercent:-15};
 parity(await pythonCalculation('futures',[input]),futuresRisk(input));
});
test.each([-80,0,15,100])('matches earnings sensitivity at growth %s',async growth=>{
 parity(await pythonCalculation('earnings',[7.1,90,5,growth,12]),earningsSensitivity(7.1,90,5,growth,12));
});
test('matches dated bond prices and sensitivity including methodology',async()=>{
 const input={settlement:'2026-10-13',previousCoupon:'2026-07-01',nextCoupon:'2027-01-01',couponPerPeriod:5,yieldPercent:12,frequency:2,cashFlows:[{date:'2027-01-01',amount:5},{date:'2027-07-01',amount:105}],shockBps:100};
 parity(await pythonCalculation('bond',[input]),bondRisk(input));
});
test('rejects invalid assumptions, oversized input and missing worker without hanging',async()=>{
 await expect(pythonCalculation('earnings',[-1,90,5,15,12])).rejects.toThrow();
 await expect(pythonCalculation('stress',['x'.repeat(131073)])).rejects.toThrow('too large');
 const saved=config.ENGINE_PYTHON_BIN;config.ENGINE_PYTHON_BIN='continua-nonexistent-python';try{await expect(pythonCalculation('stress',[[],0,{}])).rejects.toThrow('unavailable');}finally{config.ENGINE_PYTHON_BIN=saved;}
});
