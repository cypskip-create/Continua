// Deployment guard for the existing service, not a second collection engine.
import { AsyncLocalStorage } from 'node:async_hooks';
const scope = new AsyncLocalStorage();
export const lightSourceId = 'nse-index-summary';
export function lightRouteAllowed(method, path) {
    return method === 'GET' && ['/health', '/health/live', '/news/status', '/sources', '/crawl-status'].includes(path) ||
        method === 'POST' && path === '/indices/refresh';
}
export function lightSlotId(now = Date.now()) {
    return `render-index-${Math.floor(now / (6 * 60 * 60_000))}`;
}
export function runLightScope(work) {
    return scope.run({requests: 0}, work);
}
export function reserveLightRequest() {
    const state = scope.getStore();
    if (!state || ++state.requests > 4) throw new Error('Light collection request budget reached');
}
