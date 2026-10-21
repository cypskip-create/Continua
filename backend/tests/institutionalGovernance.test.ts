import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),calculate:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({query:mocks.query}));
vi.mock('../src/services/research/investmentResearch.js',()=>({calculateInvestment:mocks.calculate}));
vi.mock('../src/services/research/stockRisk.js',()=>({riskHistory:vi.fn()}));
vi.mock('../src/services/research/engineWorkspace.js',()=>({getPortfolioResearch:vi.fn()}));
import {ownedCalculation} from '../src/services/research/institutionalResearch.js';
afterEach(()=>vi.clearAllMocks());
const result=()=>({governance:{inputHash:'a'.repeat(64),modelVersion:'institutional-intelligence-v1'},methodology:'Synthetic test only'});
it('checks deployment status before using a model or cached result',async()=>{
 mocks.query.mockResolvedValue({rows:[{status:'disabled'}]});await expect(ownedCalculation('disabled-owner',{kind:'liquidity'})).rejects.toThrow('unavailable');expect(mocks.calculate).not.toHaveBeenCalled();
});
it('isolates calculation caches by verified owner and exact input',async()=>{
 mocks.query.mockResolvedValue({rows:[{status:'research'}]});mocks.calculate.mockImplementation(async()=>result());
 await ownedCalculation('cache-owner-a',{kind:'liquidity',quantity:1});await ownedCalculation('cache-owner-a',{kind:'liquidity',quantity:1});expect(mocks.calculate).toHaveBeenCalledTimes(1);
 await ownedCalculation('cache-owner-b',{kind:'liquidity',quantity:1});await ownedCalculation('cache-owner-a',{kind:'liquidity',quantity:2});expect(mocks.calculate).toHaveBeenCalledTimes(3);
 expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('record_quantitative_run'),expect.arrayContaining(['cache-owner-a','liquidity','institutional-intelligence-v1']));
});
it('rejects concurrent expensive work for one account and releases admission after failure',async()=>{
 mocks.query.mockResolvedValue({rows:[{status:'research'}]});let release!:(value:ReturnType<typeof result>)=>void;mocks.calculate.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const first=ownedCalculation('busy-owner',{kind:'liquidity',quantity:3});await vi.waitFor(()=>expect(release).toBeTypeOf('function'));await expect(ownedCalculation('busy-owner',{kind:'liquidity',quantity:4})).rejects.toMatchObject({status:429});release(result());await first;
 mocks.calculate.mockRejectedValueOnce(Object.assign(new Error('Fixture invalid inputs'),{status:422}));await expect(ownedCalculation('busy-owner',{kind:'liquidity',quantity:5})).rejects.toThrow('invalid');
 expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('record_quantitative_run'),expect.arrayContaining(['input-validation']));
 mocks.calculate.mockResolvedValueOnce(result());expect((await ownedCalculation('busy-owner',{kind:'liquidity',quantity:6})).governance.recorded).toBe(true);
});
it('keeps an audit storage failure explicit without fabricating a numerical failure',async()=>{
 mocks.query.mockImplementation(async(sql:string)=>{if(sql.includes('record_quantitative_run'))throw new Error('Fixture audit outage');return {rows:[{status:'research'}]};});mocks.calculate.mockResolvedValue(result());
 const output=await ownedCalculation('audit-outage-owner',{kind:'liquidity',quantity:7});expect(output.governance.recorded).toBe(false);
});
