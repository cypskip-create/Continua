import {expect,it} from 'vitest';
import {StressSchema,BondLabSchema,FuturesLabSchema} from '../src/services/research/engineLabSchemas.js';
const bond={settlement:'2025-03-01',previousCoupon:'2025-01-01',nextCoupon:'2025-07-01',couponPerPeriod:5,yieldPercent:10,frequency:2,cashFlows:[{date:'2025-07-01',amount:105}],shockBps:100};
it('accepts a regular explicit schedule and rejects invalid dates, past payments and omitted coupons',()=>{
 expect(BondLabSchema.safeParse(bond).success).toBe(true);
 expect(BondLabSchema.safeParse({...bond,settlement:'2025-02-30'}).success).toBe(false);
 expect(BondLabSchema.safeParse({...bond,cashFlows:[{date:'2025-02-01',amount:5}]}).success).toBe(false);
 expect(BondLabSchema.safeParse({...bond,nextCoupon:'2027-07-01'}).success).toBe(false);
 expect(BondLabSchema.safeParse({...bond,shockBps:-1000,yieldPercent:1}).success).toBe(false);
});
it('rejects forged owners, excessive shocks and unbounded quantities',()=>{
 expect(StressSchema.safeParse({marketShock:-.1,userId:'forged'}).success).toBe(false);
 expect(StressSchema.safeParse({marketShock:-1}).success).toBe(false);
 expect(FuturesLabSchema.safeParse({entry:1,settlement:1,multiplier:1,contracts:1e9,side:'long',margin:1,expiry:'2026-12-01',asOf:'2026-10-11',shockPercent:0}).success).toBe(false);
});
