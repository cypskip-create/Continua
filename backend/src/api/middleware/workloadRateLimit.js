import {ipKeyGenerator} from 'express-rate-limit';
import {rateLimitClientIP} from './edgeClientIdentity.js';
import {protectedRateLimit} from './sharedRateStore.js';

export function workloadPolicy(req) {
    const path = req.path;
    if (/(?:^|\/)(?:export|import)(?:\/|$)/.test(path)) return ['transfer', 5];
    if (path.startsWith('/billing/')) return ['billing', 20];
    if (path.startsWith('/engine/')) return req.method === 'GET' || req.method === 'HEAD'
        ? ['research', 30] : ['calculation-write', 20];
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') return ['mutation', 30];
    return null;
}
export function workloadRateLimit() {
    const limits = new Map(['transfer', 'billing', 'research', 'calculation-write', 'mutation'].map(scope => [scope,
        protectedRateLimit({
            windowMs: 60_000,
            limit: req => workloadPolicy(req)?.[1] ?? 30,
            keyGenerator: (req, res) => res.locals.engineIdentityVerified === true
                ? `user:${res.locals.engineUserId}`
                : `${req.apiKey?.id ?? 'public'}:${ipKeyGenerator(rateLimitClientIP(req, res))}`,
            standardHeaders: true,
            legacyHeaders: false,
            message: {error: 'Too many requests for this operation. Please retry shortly.', code: 'RATE_LIMITED'},
        }, 'workload-' + scope),
    ]));
    return (req, res, next) => {
        const policy = workloadPolicy(req);
        return policy ? limits.get(policy[0])(req, res, next) : next();
    };
}
/** Admission before secret verification; rotating invalid keys cannot reset it. */
export function adminRateLimit() {
    return protectedRateLimit({windowMs: 60_000, limit: 20,
        keyGenerator: (req, res) => ipKeyGenerator(rateLimitClientIP(req, res)),
        standardHeaders: true, legacyHeaders: false,
        message: {error: 'Too many administrative requests. Please retry shortly.', code: 'RATE_LIMITED'},
    }, 'admin');
}
