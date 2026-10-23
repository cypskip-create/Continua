// A leased client can disconnect between statements while the pool's idle
// error handler is detached. Keep an observer attached for its whole lifetime;
// query promises still reject and writes are never automatically retried.
export function observePoolErrors(pool,{component,report}){
 const clients=new WeakSet();
 const failed=()=>report({component},'Database connection interrupted');
 pool.on('error',failed);
 pool.on('connect',client=>{if(clients.has(client))return;clients.add(client);client.on('error',failed);});
 return pool;
}
