import { LRUCache } from 'lru-cache';
import { apiKeyRepository, hashApiKeyAsync } from '../storage/repositories/apiKeyRepository.js';
import { cache } from '../storage/cache.js';
import { logger } from '../monitoring/logger.js';
import {ApiError} from '../api/middleware/errorHandler.js';
let activeDerivations=0;
const derivationQueue=[];
async function deriveCredential(presented) {
    if(activeDerivations>=2)await new Promise((resolve,reject)=>{
        if(derivationQueue.length>=32)reject(new ApiError(503,'Credential verification is busy. Retry shortly.'));
        else derivationQueue.push(resolve);
    });
    else activeDerivations++;
    try{return await hashApiKeyAsync(presented);}
    finally{const next=derivationQueue.shift();if(next)next();else activeDerivations--;}
}
// No plaintext credentials in cache keys. TTL still bounds revocation to 30 seconds.
export async function findApiKey(presented) {
    if(typeof presented!=='string'||!presented||Buffer.byteLength(presented)>512)return null;
    // Reuse the existing stored KDF; no fast password-derived cache fingerprint.
    const hash=await deriveCredential(presented);
    return cache.getOrSet(`apikey-access:${hash}`, 30_000, () => apiKeyRepository.findActiveByHash(hash));
}
const touches = new LRUCache({ max: 1000, ttl: 60_000 });
export function recordApiKeyUse(id) {
    if (touches.has(id))
        return;
    // Reserve before starting the write: concurrent requests must not queue identical updates.
    touches.set(id, true);
    void apiKeyRepository.touchLastUsed(id).catch(() => {
        // Audit timestamp is best-effort, NOT authentication. Never crash the process
        // or include key material in diagnostics. Keep the cooldown during an outage.
        logger.warn('API-key usage timestamp unavailable; authentication remains enforced');
    });
}
