import {readdir,mkdir,copyFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(base,'src'),output=path.join(base,'dist');
async function visit(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})) {
  const file=path.join(directory,entry.name);
  if(entry.isDirectory()){await visit(file);continue;}
  if(/\.test\.(js|d\.ts)$/.test(file))continue;
  if(file.endsWith('.ts')&&!file.endsWith('.d.ts'))throw new Error('Unexpected TypeScript implementation remains');
  if(!/\.(js|json)$/.test(file)&&!file.endsWith('.d.ts'))continue;
  if(file.endsWith('.js')){
   const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
   if(check.status!==0)throw new Error(check.stderr||'JavaScript syntax validation failed');
  }
  const destination=path.join(output,path.relative(source,file));
  await mkdir(path.dirname(destination),{recursive:true});await copyFile(file,destination);
 }
}
await visit(source);
// Distribution retains the same paths and module format as the previous build.
await readFile(path.join(output,'index.js'));
console.log('Plain JavaScript service validated and built; no TypeScript runtime/compiler required.');
