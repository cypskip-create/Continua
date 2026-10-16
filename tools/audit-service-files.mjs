// Read-only conservative reachability audit. No deletion and no service startup.
// Use existing JS development tooling; declaration files are not runtime copies.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'backend/package.json'));
const ts=require('typescript');
const relative=f=>path.relative(root,f).replaceAll('\\','/');
function walk(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  if(['node_modules','dist','.git'].includes(e.name))return [];
  const f=path.join(dir,e.name);
  return e.isDirectory()?walk(f):/\.(?:[cm]?js|ts)$/.test(e.name)?[f]:[];
 });
}
for(const service of ['backend','scraper']){
 const base=path.join(root,service),files=walk(base),known=new Set(files),edges=new Map();
 for(const file of files){
  const links=new Set();
  const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function visit(n){
   // Including vi.mock and file-URL strings is deliberately conservative.
   if(ts.isStringLiteralLike(n)&&n.text.startsWith('.')){
    const target=path.resolve(path.dirname(file),n.text);
    const candidates=[target,target+'.js',target+'.mjs',target+'.ts',target+'.d.ts',path.join(target,'index.js')];
    if(target.endsWith('.js'))candidates.push(target.slice(0,-3)+'.d.ts',target.slice(0,-3)+'.ts');
    for(const candidate of candidates)if(known.has(candidate))links.add(candidate);
   }
   ts.forEachChild(n,visit);
  }
  visit(ast);edges.set(file,links);
 }
 const roots=files.filter(f=>{
  const name=path.relative(base,f).replaceAll('\\','/');
  return name==='src/index.js'||name.startsWith('tests/')||name.startsWith('scripts/')||/\.test\.(?:js|ts)$/.test(name)||name.startsWith('vitest.config.');
 });
 const reached=new Set(),stack=[...roots];
 while(stack.length){const file=stack.pop();if(reached.has(file))continue;reached.add(file);stack.push(...edges.get(file));}
 // Entrypoint declarations with no exports have no public typing information.
 const empty=files.filter(f=>f.endsWith('.d.ts')&&fs.readFileSync(f,'utf8').trim()==='export {};');
 const runtime=files.filter(f=>relative(f).startsWith(service+'/src/')&&f.endsWith('.js')&&!f.endsWith('.test.js'));
 const implementations=files.filter(f=>relative(f).startsWith(service+'/src/')&&f.endsWith('.ts')&&!f.endsWith('.d.ts'));
 console.log(JSON.stringify({service,entrypoint:`${service}/src/index.js`,runtimeModules:runtime.length,
  typescriptImplementations:implementations.map(relative),emptyDeclarations:empty.map(relative),
  unreferencedRuntimeCandidates:runtime.filter(f=>!reached.has(f)).map(relative),
  unreferencedDeclarationCandidates:files.filter(f=>f.endsWith('.d.ts')&&!reached.has(f)).map(relative),
  caveat:'Candidates require cross-repository/dynamic-reference review. Referenced declaration contracts and tests are retained.'},null,2));
}
