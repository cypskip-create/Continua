import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {investmentConfiguration} from '../src/lib/investmentConfiguration.ts';
test('imported backtests preserve their explicit capital, currency and visible controls',()=>{
 const configuration={kind:'backtest',currency:'KES',start:'2020-01-01',end:'2020-12-31',capital:25000,costBps:35,rebalance:'quarterly',assets:[{symbol:'FIXTURE'}]};
 const loaded=investmentConfiguration(configuration,'Backtesting');
 assert.equal(loaded.capital,25000);assert.equal(loaded.costBps,35);assert.equal(loaded.frequency,'quarterly');assert.equal(loaded.configuration,configuration);
 assert.throws(()=>investmentConfiguration({...configuration,capital:undefined},'Backtesting'));
});
test('owned optimization imports constraints and cannot replace server-owned covariance or holdings',()=>{
 const loaded=investmentConfiguration({kind:'optimization',symbols:['FORGED'],covariance:[[999]],maximum:{OWN:.6},turnoverCap:.2,cashMaximum:.1},'Optimization');
 assert.deepEqual(loaded.configuration,{maximum:{OWN:.6}});assert.equal(loaded.turnover,20);assert.equal(loaded.cashMaximum,10);
 assert.throws(()=>investmentConfiguration({kind:'backtest'},'Optimization'));
 assert.throws(()=>investmentConfiguration({kind:'optimization'},'Backtesting'));
});
