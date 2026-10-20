import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({calculate:vi.fn()}));
vi.mock('../src/services/research/pythonCalculations.js',()=>({pythonCalculation:m.calculate}));
import {riskSnapshot} from '../src/services/research/riskSnapshot.js';
it('coalesces identical owned revisions and isolates owners and changed quotes',async()=>{
 m.calculate.mockImplementation(async()=>({version:'risk-v1'}));
 const positions=[{symbol:'TEST',price:10}],history=[{symbol:'TEST',bars:[]}];
 const [a,b]=await Promise.all([riskSnapshot('owner-a','NSE',positions,history),riskSnapshot('owner-a','NSE',positions,history)]);
 expect(a).toEqual(b);expect(m.calculate).toHaveBeenCalledTimes(1);
 await riskSnapshot('owner-b','NSE',positions,history);expect(m.calculate).toHaveBeenCalledTimes(2);
 await riskSnapshot('owner-a','NSE',[{symbol:'TEST',price:11}],history);expect(m.calculate).toHaveBeenCalledTimes(3);
});
