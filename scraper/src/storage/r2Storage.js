import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { env } from '../config/index.js';
export function safeObjectKey(key) {
    if (!key || key.length > 1024 || key.includes('\\') || key.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f?#]/.test(key))
        throw new Error('Invalid artifact key');
    return key;
}
function client() {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET)
        throw new Error('R2 server credentials are not configured');
    return new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, maxAttempts: 3,
        requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
}
export async function readR2(key) {
    safeObjectKey(key);
    const s3 = client();
    try {
        const result = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
        if (!result.Body || (result.ContentLength ?? Infinity) > env.MAX_RESPONSE_SIZE_BYTES)
            throw new Error('Stored artifact exceeds response limit');
        const chunks = [];
        let length = 0;
        for await (const chunk of result.Body) {
            length += chunk.length;
            if (length > env.MAX_RESPONSE_SIZE_BYTES)
                throw new Error('Stored artifact exceeds response limit');
            chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks), hash = key.split('/').at(-1)?.split('.')[0];
        if (hash && /^[a-f0-9]{64}$/.test(hash) && createHash('sha256').update(bytes).digest('hex') !== hash)
            throw new Error('R2 artifact checksum mismatch');
        return bytes;
    }
    finally {
        s3.destroy();
    }
}
export async function writeR2(key, body, sha256, contentType, contentEncoding) {
    safeObjectKey(key);
    if (key.split('/').at(-1)?.split('.')[0] !== sha256 || body.length > env.MAX_RESPONSE_SIZE_BYTES || !/^[a-f0-9]{64}$/.test(sha256) || createHash('sha256').update(body).digest('hex') !== sha256)
        throw new Error('Invalid R2 artifact content');
    const s3 = client();
    try {
        // A repeated immutable receipt need not resend a multi-megabyte body.
        // Still GET and hash-check existing content; HEAD metadata alone is not
        // sufficient evidence for updating the database reference.
        let exists = false;
        try {
            const head = await s3.send(new HeadObjectCommand({Bucket:env.R2_BUCKET,Key:key}));
            if (head.ContentLength !== body.length) throw new Error('R2 existing object size mismatch');
            exists = true;
        } catch(error) { if(error.$metadata?.httpStatusCode !== 404) throw error; }
        try {
            if(!exists) await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType ?? 'application/octet-stream', Metadata: { sha256 }, IfNoneMatch: '*',...(contentEncoding?{ContentEncoding:contentEncoding}:{}) }));
        }
        catch (error) {
            if (error.$metadata?.httpStatusCode !== 412)
                throw error;
        }
        // Verify bytes with a streaming digest, not a second full PDF buffer.
        const stored = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
        const digest = createHash('sha256');
        let length = 0;
        if (!stored.Body || stored.ContentLength !== body.length)
            throw new Error('R2 write verification failed');
        try {
            for await (const chunk of stored.Body) {
                length += chunk.length;
                if (length > body.length) throw new Error('R2 write verification failed');
                digest.update(chunk);
            }
            if (length !== body.length || digest.digest('hex') !== sha256)
                throw new Error('R2 write verification failed');
        } finally { stored.Body.destroy?.(); }
    }
    finally {
        s3.destroy();
    }
}
