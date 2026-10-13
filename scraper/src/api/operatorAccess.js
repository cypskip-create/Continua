import { createHash, timingSafeEqual } from 'node:crypto';
export function validOperatorKey(provided, configured) {
    if (!configured || configured.length < 32 || !provided || provided.length > 512)
        return false;
    return timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(configured).digest());
}
export function publicCollectorRoute(method, path) {
    return (method === 'GET' && ['/health','/health/live', '/news/status'].includes(path)) ||
        (method === 'POST' && ['/indices/refresh', '/news/refresh', '/documents/refresh'].includes(path));
}
