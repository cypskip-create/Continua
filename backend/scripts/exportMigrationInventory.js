/** Read-only migration inventory. Static surface coverage is NOT semantic parity.
 * Prints JSON; never reads env files, connects to a database or writes outputs.
 */
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
async function files(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat().filter(file => /\.(js|ts)$/.test(file)&&!file.endsWith('.d.ts')).sort();
}
const modules = [];
for (const service of ['backend', 'scraper'])
    for (const file of await files(path.join(root, service, 'src'))) {
        const text = await readFile(file, 'utf8');
        const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        const routes = [];
        const exports = [];
        const visit = (node) => {
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['get', 'post', 'put', 'patch', 'delete', 'use'].includes(node.expression.name.text)) {
                const owner = node.expression.expression.getText(ast);
                if (/(router|routes|app)$/i.test(owner)) {
                    const first = node.arguments[0];
                    routes.push({ method: node.expression.name.text.toUpperCase(), path: first && ts.isStringLiteralLike(first) ? first.text : null, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 });
                }
            }
            if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))
                exports.push(node.name.text);
            ts.forEachChild(node, visit);
        };
        visit(ast);
        modules.push({ file: path.relative(root, file).replaceAll('\\', '/'), sha256: createHash('sha256').update(text).digest('hex'), routes, exports });
    }
console.log(JSON.stringify({ schemaVersion: 1, scope: 'Static inventory only; preserve mounts, middleware, transactions, workers and behavior tests during ports', modules }, null, 2));
