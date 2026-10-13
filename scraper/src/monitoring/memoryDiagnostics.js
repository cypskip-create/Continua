import {readFile} from 'node:fs/promises';
import {logger} from './logger.js';
/** Container usage includes Chromium/OCR children; Node RSS alone does not. */
async function readNumber(file) {
    try { const value=Number((await readFile(file,'utf8')).trim()); return Number.isFinite(value)?value:null; }
    catch { return null; }
}
export async function memorySnapshot() {
    const current=await readNumber('/sys/fs/cgroup/memory.current') ?? await readNumber('/sys/fs/cgroup/memory/memory.usage_in_bytes');
    const limit=await readNumber('/sys/fs/cgroup/memory.max') ?? await readNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    const {rss,heapUsed,external}=process.memoryUsage();
    return {rssBytes:rss,heapUsedBytes:heapUsed,externalBytes:external,containerBytes:current,containerLimitBytes:limit,
        containerUtilization:current!==null&&limit!==null&&limit>0?current/limit:null};
}
export function startMemoryDiagnostics() {
    const timer=setInterval(()=>{void memorySnapshot().then(snapshot=>{
        logger[snapshot.containerUtilization!==null&&snapshot.containerUtilization>.8?'warn':'info'](snapshot,'Scraper memory budget');
    }).catch(()=>{});},60000);
    timer.unref();return ()=>clearInterval(timer);
}
