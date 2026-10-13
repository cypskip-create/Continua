/** Explicit sandbox-only provider contract check. No live-key fallback, real
 * phone number, card data, account entitlement or user email is ever used. */
import { privateDecrypt, constants, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const encrypted = process.argv[2], keyFile = process.argv[3];
const key = encrypted && keyFile ? privateDecrypt({ key: readFileSync(keyFile), format: 'der', type: 'pkcs8', padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(readFileSync(encrypted, 'utf8').trim(), 'base64')).toString('utf8') : process.env.PAYSTACK_TEST_SECRET_KEY;
if (!key?.startsWith('sk_test_'))
    throw new Error('Explicit Paystack Test Mode credential required; live keys are forbidden');
async function request(path, body) {
    const response = await fetch('https://api.paystack.co' + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    return { http: response.status, ...result };
}
for (const method of ['mpesa', 'airtel', 'card']) {
    const reference = 'continua-test-' + randomUUID();
    const body = { email: 'continua-sandbox@example.com', amount: 100000, currency: 'KES', reference,
        metadata: JSON.stringify({ continua_reference: reference, continua_user: 'sandbox-only', mode: 'test' }),
        ...(method !== 'card' ? { mobile_money: { phone: '+254710000000', provider: method === 'mpesa' ? 'mpesa' : 'atl' } } : { channels: ['card'] }) };
    const result = await request(method !== 'card' ? '/charge' : '/transaction/initialize', body);
    console.log(JSON.stringify({ method, http: result.http, accepted: result.status, referenceMatches: result.data?.reference === reference, status: result.data?.status ?? null, secureAccessCode: !!result.data?.access_code }));
    if (result.status && method !== 'card') {
        const verified = await request('/transaction/verify/' + reference);
        console.log(JSON.stringify({ method, verificationHttp: verified.http, mode: verified.data?.domain, status: verified.data?.status, amountMatches: verified.data?.amount === 100000, currencyMatches: verified.data?.currency === 'KES' }));
    }
}
