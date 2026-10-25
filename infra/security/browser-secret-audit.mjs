// Privileged credentials must never enter a browser artifact. Public project
// identifiers/publishable keys are not treated as security credentials.
import {readdir, readFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
const root = resolve(process.argv[2] ?? 'app/dist');
const files = [];
async function walk(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (/\.(?:js|mjs|html|json|map|css)$/i.test(entry.name)) files.push(path);
    }
}
await walk(root);
if (!files.length) throw Error('Browser artifact directory is empty');
const known = [];
// Optional local verification against existing server env files. Never output
// credential values, lines or matching snippets, including on failure.
for (const path of (process.env.CONTINUA_BROWSER_AUDIT_ENV_FILES ?? '').split(';').filter(Boolean)) {
    for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
        if (match && /(?:SERVICE_ROLE|SECRET|ADMIN_API_KEY|DATABASE_URL|R2_ACCESS_KEY_ID|AUTH_SMTP_KEY|NEON_AUTH_SESSION_KEY)/.test(match[1])) {
            const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
            if (value.length >= 12) known.push({name: match[1], value});
        }
    }
}
const findings = [];
for (const path of files) {
    const text = await readFile(path, 'utf8'), kinds = new Set();
    for (const [kind, pattern] of [
        ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{16,}/],
        ['GitHub token', /(?:github_pat_|ghp_)[A-Za-z0-9_]{20,}/],
        ['provider secret', /\b(?:sk_(?:live|test)[_-]|sk-proj-)[A-Za-z0-9_-]{20,}/],
        ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ]) if (pattern.test(text)) kinds.add(kind);
    for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
        try {const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); if (claims.role === 'service_role') kinds.add('privileged Supabase JWT');} catch {/* Not a JWT. */}
    }
    for (const item of known) if (text.includes(item.value)) kinds.add('server configuration: ' + item.name);
    if (kinds.size) findings.push({file: relative(root, path), kinds: [...kinds]});
}
console.log(JSON.stringify({filesScanned: files.length, serverValuesCompared: known.length, findings}));
if (findings.length) process.exitCode = 1;
