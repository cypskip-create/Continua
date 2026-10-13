/** Controlled mechanical language migration. Not a performance optimization.
 * Preserve the compiler's exact JavaScript behavior and type-only contracts;
 * retain a local source backup and runtime hashes before removing originals.
 */
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir,copyFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const service=process.argv[2];
if(!['backend','scraper'].includes(service))throw new Error('Choose backend or scraper');
const base=path.join(root,service);
const ts=createRequire(path.join(base,'package.json'))('typescript');
const backup=path.join(root,'.qa-artifacts','language-migration',service);
function contained(directory,file){const relative=path.relative(directory,path.resolve(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe migration target');return path.resolve(file);}
async function walk(directory){const entries=await readdir(directory,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(directory,e.name)):[path.join(directory,e.name)]))).flat().filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts')).sort();}
if(process.argv.includes('--repair-scripts')) {
  for(const original of await walk(path.join(backup,'scripts'))) {
    const target=contained(path.join(base,'scripts'),path.join(base,'scripts',path.relative(path.join(backup,'scripts'),original).replace(/\.ts$/,'.js')));
    const result=ts.transpileModule(await readFile(original,'utf8'),{fileName:original,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,esModuleInterop:true}});
    await writeFile(target,result.outputText);
  }
  console.log('ES module CLI scripts regenerated from the retained local source backup.');
  process.exit(0);
}
const configFile=ts.readConfigFile(path.join(base,'tsconfig.build.json'),ts.sys.readFile);
if(configFile.error)throw new Error('Cannot read compiler configuration');
const config=ts.parseJsonConfigFileContent(configFile.config,ts.sys,base);
const outputs=new Map();
const program=ts.createProgram(config.fileNames,{...config.options,declaration:true,sourceMap:false,noEmitOnError:true});
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>base,getNewLine:()=> '\n'}));
const emitted=program.emit(undefined,(file,text)=>outputs.set(path.resolve(file),text));
if(emitted.emitSkipped||emitted.diagnostics.length)throw new Error('Declaration/JavaScript emission failed; no source files changed');
const sources=await walk(path.join(base,'src'));
const scripts=await walk(path.join(base,'scripts'));
if(!sources.length)throw new Error('Source is already migrated; retained backup was not modified.');
const pending=[];
for(const source of sources){
  contained(path.join(base,'src'),source);
  const relative=path.relative(path.join(base,'src'),source).replace(/\.ts$/,'.js');
  const generated=outputs.get(path.join(base,'dist',relative));
  const declaration=outputs.get(path.join(base,'dist',relative.replace(/\.js$/,'.d.ts')));
  if(generated===undefined||declaration===undefined)throw new Error(`Missing output: ${relative}`);
  pending.push({source,javascript:source.replace(/\.ts$/,'.js'),generated,declaration});
}
for(const source of scripts){
  contained(path.join(base,'scripts'),source);
  const result=ts.transpileModule(await readFile(source,'utf8'),{fileName:source,compilerOptions:{...config.options,module:ts.ModuleKind.ES2022,sourceMap:false,declaration:false}});
  pending.push({source,javascript:source.replace(/\.ts$/,'.js'),generated:result.outputText,declaration:null});
}
const manifest=[];
for(const item of pending){
  const relative=path.relative(base,item.source);
  const saved=contained(backup,path.join(backup,relative));
  await mkdir(path.dirname(saved),{recursive:true});await copyFile(item.source,saved);
  await writeFile(contained(base,item.javascript),item.generated);
  if(item.declaration!==null)await writeFile(contained(base,item.source.replace(/\.ts$/,'.d.ts')),item.declaration);
  manifest.push({original:relative.replaceAll('\\','/'),javascript:path.relative(base,item.javascript).replaceAll('\\','/'),sha256:createHash('sha256').update(item.generated).digest('hex')});
}
// Each individual original has an emitted replacement AND a local backup.
// No recursive delete, no computed broad directory deletion.
for(const item of pending)await unlink(contained(base,item.source));
await writeFile(path.join(backup,'runtime-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({service,implementationFiles:pending.length,sourceContracts:sources.length,backup:'ignored local .qa-artifacts',runtimeBehavior:'compiler-equivalent JavaScript'}));
