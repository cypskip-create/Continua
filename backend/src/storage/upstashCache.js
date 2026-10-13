export class UpstashCache {
    url;
    token;
    namespace;
    fallback;
    pending = new Map();
    metrics = { hits: 0, misses: 0, failures: 0 };
    constructor(url, token, namespace, fallback) {
        this.url = url;
        this.token = token;
        this.namespace = namespace;
        this.fallback = fallback;
        const endpoint = new URL(url);
        if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.upstash.io') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !token || !/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace))
            throw new Error('Invalid Upstash cache configuration');
    }
    async command(parts) {
        const response = await fetch(this.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(1500), headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(parts) });
        if (!response.ok)
            throw new Error('Cache request failed');
        const data = await response.json();
        if (data.error)
            throw new Error('Cache command failed');
        return data.result;
    }
    async get(key) {
        try {
            const raw = await this.command(['GET', `${this.namespace}:${key}`]);
            if (raw == null) {
                this.metrics.misses++;
                return null;
            }
            if (typeof raw !== 'string')
                throw new Error('Invalid cache value');
            const result = JSON.parse(raw);
            this.metrics.hits++;
            return result;
        }
        catch {
            this.metrics.failures++;
            return this.fallback.get(key);
        }
    }
    async set(key, value, ttlMs = 60000) {
        await this.fallback.set(key, value, ttlMs);
        try {
            await this.command(['SET', `${this.namespace}:${key}`, JSON.stringify(value), 'PX', Math.max(1, Math.floor(ttlMs))]);
        }
        catch {
            this.metrics.failures++;
        }
    }
    async del(key) { await this.fallback.del(key); try {
        await this.command(['DEL', `${this.namespace}:${key}`]);
    }
    catch {
        this.metrics.failures++;
    } }
    async getOrSet(key, ttlMs, fn) {
        const cached = await this.get(key);
        if (cached !== null)
            return cached;
        const existing = this.pending.get(key);
        if (existing)
            return existing;
        const job = Promise.resolve().then(fn).then(async (value) => { await this.set(key, value, ttlMs); return value; });
        this.pending.set(key, job);
        try {
            return await job;
        }
        finally {
            this.pending.delete(key);
        }
    }
}
