type StorageView=Pick<Storage,'length'|'key'|'removeItem'>;
// Device lock identifiers and public chart/display preferences are retained.
// Private journals are user-authored records: never silently delete them.
export function clearPrivateSessionCache(storage:StorageView) {
 let complete=true;const keys:string[]=[];
 try {for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&(
  key.startsWith('continua:account:')||key.startsWith('continua:private-snapshot:')||key.startsWith('continua:portfolio:')||key.startsWith('continua:company-engine:')||
  key.startsWith('continua-valuation-model-assignments:')||/^sb-[a-z0-9]+-auth-token$/.test(key)
 ))keys.push(key);}}catch{complete=false;}
 for(const key of keys)try{storage.removeItem(key);}catch{complete=false;}
 return {complete,removed:keys.length};
}
