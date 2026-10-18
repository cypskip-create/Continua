import {expect,it} from 'vitest';
import {assertDurableStorage} from '../../src/storage/storagePolicy.js';
it('rejects duplicate Supabase uploads regardless of runtime',()=>{
 for(const value of ['true','1','yes'])expect(()=>assertDurableStorage({R2_DUAL_WRITE:value},'r2')).toThrow('Supabase file writes are disabled');
 expect(()=>assertDurableStorage({R2_DUAL_WRITE:'false'},'r2')).not.toThrow();
});
it('fails closed on Render and production instead of writing persistent local artifacts',()=>{
 for(const environment of [{RENDER:'true'},{RENDER_SERVICE_ID:'fixture'},{NODE_ENV:'production'}]){
  for(const driver of ['local','supabase',undefined])expect(()=>assertDurableStorage(environment,driver)).toThrow('private R2');
  expect(()=>assertDurableStorage(environment,'r2')).not.toThrow();
 }
 expect(()=>assertDurableStorage({NODE_ENV:'test'},'local')).not.toThrow();
});
