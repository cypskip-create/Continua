import {it,expect} from 'vitest';
import {canMonitor,monitoringRuleLimit} from '../src/services/research/monitorEntitlements.js';
import {evaluateMonitor} from '../src/services/research/engineMonitoring.js';
it('grants paid alert kinds and limits according to verified tier',()=>{
 expect(canMonitor('free','price_above')).toBe(false);
 expect(canMonitor('premium','volume_above')).toBe(true);expect(canMonitor('premium','material_change')).toBe(false);
 expect(canMonitor('premium_plus','material_change')).toBe(true);
 expect(monitoringRuleLimit('premium')).toBe(20);expect(monitoringRuleLimit('premium_plus')).toBe(50);
});
it('checks observed daily returns and volume without firing on stale or missing input',()=>{
 const state={quoteFresh:true,dailyChange:4.5,volume:10000};
 expect(evaluateMonitor({kind:'daily_gain_above',threshold:4},state).notify).toBe(true);
 expect(evaluateMonitor({kind:'daily_loss_below',threshold:-3},{...state,dailyChange:-4}).notify).toBe(true);
 expect(evaluateMonitor({kind:'volume_above',threshold:9000},state).notify).toBe(true);
 expect(evaluateMonitor({kind:'volume_above',threshold:9000,last_state:{triggered:true}},state).notify).toBe(false);
 expect(evaluateMonitor({kind:'daily_gain_above',threshold:4},{...state,quoteFresh:false}).unavailable).toBe(true);
 expect(evaluateMonitor({kind:'volume_above',threshold:9000},{...state,volume:null}).notify).toBe(false);
});
