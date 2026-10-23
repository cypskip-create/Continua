import {it,expect,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({query:vi.fn()}));
import {aggregatePortfolioScorecard} from '../src/services/research/portfolioScorecard.js';
it('weights actual company financial strength by value instead of counting holdings equally',()=>{
 const result=aggregatePortfolioScorecard([{value:900,health:80},{value:100,health:20}]);expect(result.measures.health.score).toBe(74);
});
it('withholds incomplete, invalid or unpriced health instead of inventing a neutral score',()=>{
 expect(aggregatePortfolioScorecard([{value:400,health:80},{value:600,health:null}]).measures.health.score).toBeNull();
 expect(aggregatePortfolioScorecard([{value:100,health:80},{value:null,health:50}]).measures.health.score).toBeNull();
 expect(aggregatePortfolioScorecard([{value:100,health:Infinity}]).measures.health.score).toBeNull();
});
