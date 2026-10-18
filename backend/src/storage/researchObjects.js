import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {LRUCache} from 'lru-cache';

const bucket='continua-financial-documents',maxBytes=8*1024*1024;
const cache=new LRUCache({max:128,maxSize:32*1024*1024,sizeCalculation:v=>v.length,ttl:600000});
let client,active=0;

export function processedObjectKey(receipt) {
    const {object_uri:location,sha256:hash,size_bytes:size}=receipt??{};
    if(typeof location!=='string'||!/^r2:\/\/continua-financial-documents\/processed\/research\/[a-zA-Z0-9_-]{1,100}\/[1-9][0-9]*\/[a-f0-9]{64}\.json\.gz$/.test(location)||
       !/^[a-f0-9]{64}$/.test(hash??'')||location.split('/').at(-1)!==hash+'.json.gz'||
       !Number.isSafeInteger(Number(size))||Number(size)<1||Number(size)>maxBytes)
        throw new Error('Invalid processed object receipt');
    return location.slice(('r2://'+bucket+'/').length);
}

export function decodeProcessedObject(bytes,receipt,expected) {
    processedObjectKey(receipt);
    if(bytes.length!==Number(receipt.size_bytes)||createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)
        throw new Error('Processed object integrity mismatch');
    const decoded=gunzipSync(bytes,{maxOutputLength:maxBytes});
    const value=JSON.parse(decoded.toString('utf8'));
    if(value?.schemaVersion!==1||value.kind!=='processed-research'||
       String(value.extractionId)!==String(expected.extraction_id)||
       value.processorVersion!==expected.processor_version||value.securityId!==expected.security_id||
       value.destination!==expected.destination||value.status!==expected.status||
       !value.payload||typeof value.payload!=='object'||Array.isArray(value.payload))
        throw new Error('Processed object identity mismatch');
    return value.payload;
}

function connection() {
    if(client)return client;
    const account=process.env.R2_ACCOUNT_ID;
    if(account!=='de867ecc0ef417877b8d4ef9580c4fe7'||!process.env.R2_ACCESS_KEY_ID||!process.env.R2_SECRET_ACCESS_KEY)
        throw new Error('Private processed storage is not configured');
    client=new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,
        credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},
        maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
    return client;
}

export const processedObjectRepository={read:readProcessedObject};
export async function readProcessedObject(receipt,expected,signal=AbortSignal.timeout(12000)) {
    const key=processedObjectKey(receipt);
    let bytes=cache.get(key);
    if(!bytes) {
        if(active>=4)throw new Error('Processed storage capacity unavailable');
        active++;
        let body;
        const abort=()=>body?.destroy?.();
        try {
            const result=await connection().send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:signal});
            body=result.Body;
            if(!body||result.ContentLength!==Number(receipt.size_bytes))throw new Error('Processed object size mismatch');
            signal.addEventListener('abort',abort,{once:true});
            if(signal.aborted)throw new Error('Processed storage deadline exceeded');
            const chunks=[];let size=0;
            for await(const chunk of body) {
                size+=chunk.length;
                if(size>Number(receipt.size_bytes)||signal.aborted)throw new Error('Processed object response exceeds limit');
                chunks.push(Buffer.from(chunk));
            }
            bytes=Buffer.concat(chunks);
            // Validate identity before admitting bytes to the immutable cache.
            const payload=decodeProcessedObject(bytes,receipt,expected);
            cache.set(key,bytes);
            return payload;
        } finally {
            signal.removeEventListener('abort',abort);body?.destroy?.();active--;
        }
    }
    // Permission is checked in SQL on every call. Cache hits still verify that
    // the caller's current metadata identifies this exact immutable object.
    return decodeProcessedObject(bytes,receipt,expected);
}
