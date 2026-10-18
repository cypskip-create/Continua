import {describe,it,expect} from 'vitest';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {decodeProcessedObject,processedObjectKey} from '../src/storage/researchObjects.js';

function fixture(payload={revenue:null}) {
    const expected={extraction_id:'7',processor_version:'collected-research-v1',security_id:'NSE:KCB',destination:'financials',status:'publisher_observation'};
    const bytes=gzipSync(JSON.stringify({schemaVersion:1,kind:'processed-research',extractionId:7,
        processorVersion:expected.processor_version,securityId:expected.security_id,
        destination:expected.destination,status:expected.status,payload}));
    const hash=createHash('sha256').update(bytes).digest('hex');
    const receipt={object_uri:`r2://continua-financial-documents/processed/research/collected-research-v1/7/${hash}.json.gz`,sha256:hash,size_bytes:bytes.length};
    return {expected,bytes,receipt};
}
describe('private prepared objects',()=>{
    it('preserves source precision and missing values after integrity and issuer verification',()=>{
        const f=fixture({revenue:1234567.89123,eps:null});
        expect(decodeProcessedObject(f.bytes,f.receipt,f.expected)).toEqual({revenue:1234567.89123,eps:null});
        expect(processedObjectKey(f.receipt)).toMatch(/^processed\/research\//);
    });
    it('rejects corrupt bytes, cross-issuer objects and forged metadata',()=>{
        const f=fixture();
        expect(()=>decodeProcessedObject(Buffer.alloc(f.bytes.length),f.receipt,f.expected)).toThrow('integrity');
        expect(()=>decodeProcessedObject(f.bytes,f.receipt,{...f.expected,security_id:'NSE:COOP'})).toThrow('identity');
        expect(()=>decodeProcessedObject(f.bytes,f.receipt,{...f.expected,extraction_id:'8'})).toThrow('identity');
        for(const location of [f.receipt.object_uri.replace('continua-financial-documents','other-bucket'),
            f.receipt.object_uri.replace('/processed/','/raw/'),f.receipt.object_uri+'?token=secret'])
            expect(()=>processedObjectKey({...f.receipt,object_uri:location})).toThrow('receipt');
    });
    it('bounds decoded gzip output, not only the compressed transfer',()=>{
        const f=fixture({text:'x'.repeat(8*1024*1024)});
        expect(()=>decodeProcessedObject(f.bytes,f.receipt,f.expected)).toThrow();
    });
});
