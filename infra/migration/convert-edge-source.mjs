import {createRequire} from 'node:module';
import {readdir,readFile,writeFile,mkdir,copyFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ts=createRequire(path.join(root,'backend/package.json'))('typescript');
const base=path.join(root,'supabase/functions');
let count=0;
for(const entry of await readdir(base,{withFileTypes:true})){
 if(!entry.isDirectory())continue;
 const source=path.join(base,entry.name,'index.ts');
 let text;try{text=await readFile(source,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
 const relative=path.relative(base,path.resolve(source));
 if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe conversion path');
 const backup=path.join(root,'.qa-artifacts/language-migration/edge',entry.name,'index.ts');
 await mkdir(path.dirname(backup),{recursive:true});await copyFile(source,backup);
 // A JS entrypoint does not execute the IDE-only Deno declaration module.
 text=text.replace(/^import ["']\.\.\/deno\.d\.ts["'];\s*$/gm,'');
 const output=ts.transpileModule(text,{fileName:source,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const destination=source.replace(/\.ts$/,'.js');
 await writeFile(destination,output);await unlink(source);count++;
}
console.log(JSON.stringify({edgeFunctionsConverted:count,retainedTypeDeclarations:true}));
