import {beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
const mocks=vi.hoisted(()=>({write:vi.fn(),read:vi.fn(),env:{RAW_STORAGE_DRIVER:'r2',R2_BUCKET:'private-fixture',R2_DUAL_WRITE:false,MAX_RESPONSE_SIZE_BYTES:1000000}}));
vi.mock('../../src/config/index.js',()=>({env:mocks.env}));
vi.mock('../../src/storage/r2Storage.js',()=>({safeObjectKey:(key:string)=>key,writeR2:mocks.write,readR2:mocks.read}));
import {storeRawArtifact,readRawArtifact} from '../../src/storage/rawStorage.js';
beforeEach(()=>{vi.clearAllMocks();mocks.env.R2_DUAL_WRITE=false;mocks.env.MAX_RESPONSE_SIZE_BYTES=1000000;});
it('compresses the representation without rewriting source evidence or its recorded hash',async()=>{
 const body=Buffer.from('<html>'+ 'literal financial evidence '.repeat(10000)),sha256=createHash('sha256').update(body).digest('hex');
 const location=await storeRawArtifact({sourceId:'fixture',sha256,body,contentType:'text/html'});
 const [key,encoded,encodedHash,type,encoding]=mocks.write.mock.calls[0]!;
 expect(location).toMatch(/\.html\.gz$/);expect(encoded.length).toBeLessThan(body.length/5);expect(encodedHash).toBe(createHash('sha256').update(encoded).digest('hex'));expect(type).toBe('text/html');expect(encoding).toBe('gzip');expect(gunzipSync(encoded).equals(body)).toBe(true);
 mocks.read.mockResolvedValue(encoded);expect((await readRawArtifact(location)).equals(body)).toBe(true);expect(mocks.read).toHaveBeenCalledWith(key);
});
it('limits decoded bytes and keeps ordinary PDF source bytes unchanged',async()=>{
 mocks.read.mockResolvedValue(gzipSync(Buffer.alloc(10000)));mocks.env.MAX_RESPONSE_SIZE_BYTES=100;
 await expect(readRawArtifact('r2://private-fixture/fixture/2026/'+ 'a'.repeat(64)+'.html.gz')).rejects.toThrow();
 mocks.env.MAX_RESPONSE_SIZE_BYTES=1000000;const body=Buffer.from('%PDF literal'),sha256=createHash('sha256').update(body).digest('hex');
 const location=await storeRawArtifact({sourceId:'fixture',sha256,body,contentType:'application/pdf'});
 expect(location).toMatch(/\.pdf$/);expect(mocks.write.mock.calls[0]![1].equals(body)).toBe(true);
});
