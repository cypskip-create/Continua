import {expect,it} from 'vitest';
import {defaultPreferences,recordInterest,researchRecommendations} from '../src/services/research/enginePreferences.js';
it('requires opt-in, deduplicates daily reloads and resets learned interests',()=>{
 const now=new Date('2026-10-12T00:00:00Z'),off=defaultPreferences();
 expect(recordInterest(off,'KCB','NSE',false,now).interests).toEqual([]);
 const on=recordInterest({...off,learnInterests:true},'KCB','NSE',false,now);
 expect(recordInterest(on,'KCB','NSE',false,now).interests[0]!.visits).toBe(1);
 expect(recordInterest(on,'KCB','NSE',true,now).interests).toEqual([]);
 expect(researchRecommendations({...on,learnInterests:false},now).companies).toEqual([]);
 expect(researchRecommendations({...on,interests:[{symbol:'KCB',exchange:'NSE',visits:100}]},now).companies).toEqual([]);
 expect(recordInterest({...on,interests:[{symbol:'KCB',exchange:'NSE',visits:100}]},'KCB','NSE',false,now).interests[0]!.visits).toBe(1);
});
it('recent interests can outrank old interests without changing stated risk comfort',()=>{
 const s={...defaultPreferences(),learnInterests:true,goal:'Income' as const,interests:[{symbol:'KCB',exchange:'NSE',visits:20,lastSeen:'2025-10-12T00:00:00Z'},{symbol:'SCOM',exchange:'NSE',visits:1,lastSeen:'2026-10-12T00:00:00Z'}]};
 const r=researchRecommendations(s,new Date('2026-10-12T00:00:00Z'));expect(r.companies[0]!.symbol).toBe('SCOM');expect(r.tools[0]).toBe('Earnings & Reports');expect(s.riskComfort).toBe('unspecified');
});
