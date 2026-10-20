import { timingSafeEqual } from 'node:crypto';
export function validOperatorKey(provided, configured) {
    if (!configured || configured.length < 32 || !provided || Buffer.byteLength(provided) > 512 || Buffer.byteLength(configured) > 512 || provided.length !== configured.length)
        return false;
    return timingSafeEqual(paddedKey(provided), paddedKey(configured));
}
export function publicCollectorRoute(method, path) {
    return (method === 'GET' && ['/health','/health/live', '/news/status'].includes(path)) ||
        (method === 'POST' && ['/indices/refresh', '/news/refresh', '/documents/refresh'].includes(path));
}

function paddedKey(value) { const bytes = Buffer.alloc(512); bytes.write(value); return bytes; }
