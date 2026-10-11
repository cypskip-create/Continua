import {it,expect} from 'vitest';
import {earningsSensitivity,EarningsSensitivitySchema} from '../src/services/research/earningsSensitivity.js';
it('calculates the central cell and reverse break-even consistently',()=>{const s=earningsSensitivity(5,100,2,10,20);expect(s.cells).toHaveLength(9);expect(s.cells[4]?.illustrativePrice).toBeCloseTo(121);expect(s.cells[4]?.annualizedPriceReturnPercent).toBeCloseTo(10);expect(s.breakEvenGrowthPercent).toBe(0);});
it('rejects unsupported or unbounded assumptions',()=>{expect(()=>earningsSensitivity(-1,100,2,5,10)).toThrow();expect(()=>earningsSensitivity(1,100,2.5,5,10)).toThrow();expect(EarningsSensitivitySchema.safeParse({symbol:'SCOM',years:50,growthPercent:5,exitPe:10}).success).toBe(false);});
