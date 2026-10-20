import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/index.js';
import { ApiError } from '../../api/middleware/errorHandler.js';
let active = 0;
export function pythonCalculation(operation, args) {
    const riskOperation=operation.startsWith('risk_')||operation==='stock_risk';
    const payload = JSON.stringify({ operation, args });
    if (Buffer.byteLength(payload) > (riskOperation ? 2097152 : 131072))
        return Promise.reject(new ApiError(413, 'Calculation inputs are too large.'));
    if (active >= 2)
        return Promise.reject(new ApiError(503, 'Calculation capacity is busy. Try again shortly.'));
    active++;
    return new Promise((resolve, reject) => {
        let child;
        try { child = spawn(env.ENGINE_PYTHON_BIN, [fileURLToPath(new URL('../../../python/engine_calculations.py', import.meta.url))], {
            windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
            // A calculator has no need for payment, database or provider secrets.
            env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PYTHONUTF8: '1' },
        });
        } catch { active--; reject(new ApiError(503,'Calculation worker is unavailable.')); return; }
        const chunks = [];
        let size = 0, settled = false, failure;
        const finish = (error, result) => { if (settled)
            return; settled = true; clearTimeout(timer); active--; if (error)
            reject(error);
        else
            resolve(result); };
        const stop = error => {failure ??= error; child.kill('SIGKILL');};
        const timer = setTimeout(() => stop(new ApiError(503, 'Calculation deadline exceeded.')), 5000);
        child.on('error', () => finish(new ApiError(503, 'Calculation worker is unavailable.')));
        child.stdin.on('error', () => stop(new ApiError(503, 'Calculation worker could not accept inputs.')));
        child.stdout.on('data', (chunk) => { size += chunk.length; if (size > (riskOperation ? 4194304 : 1048576)) {
            stop(new ApiError(503, 'Calculation output limit exceeded.'));
        }
        else if (!failure)
            chunks.push(chunk); });
        child.on('close', code => { if (failure) return finish(failure);
        if (code !== 0)
            return finish(new ApiError(503, 'Calculation worker could not complete this request.')); try {
            finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8')));
        }
        catch {
            finish(new ApiError(503, 'Calculation returned an invalid result.'));
        } });
        child.stdin.end(payload);
    });
}
export async function calculateWithRuntime(operation, args, node) {
    return env.ENGINE_CALCULATION_RUNTIME === 'python' ? pythonCalculation(operation, args) : node();
}
