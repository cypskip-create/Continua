import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
const mocks=vi.hoisted(()=>({send:vi.fn(),destroy:vi.fn()}));
vi.mock('../../src/config/index.js',()=>({env:{R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture',R2_BUCKET:'private-documents',MAX_RESPONSE_SIZE_BYTES:10000}}));
vi.mock('@aws-sdk/client-s3',()=>({S3Client:class{send=mocks.send;destroy=mocks.destroy;},GetObjectCommand:class{constructor(public input:unknown){}},PutObjectCommand:class{constructor(public input:unknown){}},HeadObjectCommand:class{constructor(public input:unknown){}}}));
import {safeObjectKey,readR2,writeR2} from '../../src/storage/r2Storage.js';
const bytes=Buffer.from('%PDF-fixture'),hash=createHash('sha256').update(bytes).digest('hex'),key=`nse/2026/${hash}.pdf`;
function stored(body=bytes){return {ContentLength:body.length,Body:(async function*(){yield body;})()};}
beforeEach(()=>vi.clearAllMocks());afterEach(()=>vi.restoreAllMocks());
it('rejects traversal and mismatched content before writing',async()=>{expect(()=>safeObjectKey('../secret')).toThrow();await expect(writeR2(key,Buffer.from('other'),hash,'application/pdf')).rejects.toThrow();expect(mocks.send).not.toHaveBeenCalled();});
it('verifies reads and destroys the client even on corrupt data',async()=>{mocks.send.mockResolvedValue(stored(Buffer.from('wrong')));await expect(readR2(key)).rejects.toThrow('checksum');expect(mocks.destroy).toHaveBeenCalled();});
it('writes immutable objects and verifies a streamed digest without a second client',async()=>{mocks.send.mockRejectedValueOnce({$metadata:{httpStatusCode:404}}).mockResolvedValueOnce({}).mockResolvedValueOnce(stored());await writeR2(key,bytes,hash,'application/pdf');expect(mocks.send.mock.calls[1]?.[0].input.IfNoneMatch).toBe('*');expect(mocks.destroy).toHaveBeenCalledTimes(1);});
it('handles another uploader winning the race without overwriting its object',async()=>{mocks.send.mockRejectedValueOnce({$metadata:{httpStatusCode:404}}).mockRejectedValueOnce({$metadata:{httpStatusCode:412}}).mockResolvedValueOnce(stored());await writeR2(key,bytes,hash,'application/pdf');expect(mocks.send).toHaveBeenCalledTimes(3);});
it('verifies an existing immutable object without uploading the body again',async()=>{mocks.send.mockResolvedValueOnce({ContentLength:bytes.length}).mockResolvedValueOnce(stored());await writeR2(key,bytes,hash,'application/pdf');expect(mocks.send).toHaveBeenCalledTimes(2);expect(mocks.send.mock.calls.every(call=>!call[0].input.Body)).toBe(true);});
it('never trusts an existing object checksum merely because HEAD succeeded',async()=>{mocks.send.mockResolvedValueOnce({ContentLength:bytes.length}).mockResolvedValueOnce(stored(Buffer.alloc(bytes.length)));await expect(writeR2(key,bytes,hash,'application/pdf')).rejects.toThrow('verification');});
it('rejects oversized stored objects before streaming',async()=>{mocks.send.mockResolvedValue({ContentLength:10001,Body:{}});await expect(readR2(key)).rejects.toThrow('limit');});
