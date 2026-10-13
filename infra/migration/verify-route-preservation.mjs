import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ts=createRequire(path.join(root,'backend/package.json'))('typescript');
async function walk(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat().filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts'));}
function surface(text,file){const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);const calls=[];const visit=node=>{
 if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['get','post','put','patch','delete','use'].includes(node.expression.name.text)&&/(router|routes|app)$/i.test(node.expression.expression.getText(source))) {
  // Includes middleware/mount expressions, not only a list of endpoint paths.
  calls.push(node.expression.getText(source)+':'+node.arguments.map(a=>a.getText(source).replace(/\s+/g,'')).join('|'));
 }ts.forEachChild(node,visit);};visit(source);return calls;}
let modules=0,routes=0;
for(const service of ['backend','scraper'])for(const file of await walk(path.join(root,'.qa-artifacts/language-migration',service,'src'))) {
 const relative=path.relative(path.join(root,'.qa-artifacts/language-migration',service,'src'),file);
 const target=path.join(root,service,'src',relative.replace(/\.ts$/,'.js'));
 const original=await readFile(file,'utf8'),current=await readFile(target,'utf8');
 // Compare emitted JS against JS: type arguments/assertions are intentionally removed.
 const emitted=ts.transpileModule(original,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const required=surface(emitted,file),actual=surface(current,target);
 for(const call of required)if(!actual.includes(call))throw new Error(`Lost route/middleware call in ${service}/${relative}: ${call.slice(0,120)}`);
 modules++;routes+=required.length;
}
console.log(JSON.stringify({modulesChecked:modules,originalRouteAndMiddlewareCallsPreserved:routes,newRoutesAllowed:true,note:'Static surface parity complements, not replaces, behavioral tests.'}));
