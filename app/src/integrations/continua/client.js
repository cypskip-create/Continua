import {createIdentityClient} from './identityClient.js';
import {createBrowserDataClient} from './browserDataClient.js';
import {createPrivateChannels} from './privateChannels.js';

// Construct only when the matching owned backend and edge routes are deployed.
// This factory never reads Supabase configuration or persistent browser tokens.
export function createContinuaClient({origin,fetcher,channel,location,replaceUrl,WebSocketImpl}){
 const identity=createIdentityClient({origin,fetcher,channel,location,replaceUrl});
 const data=createBrowserDataClient({identity:identity.auth,origin,fetcher});
 const realtime=createPrivateChannels({origin,identity:identity.auth,WebSocketImpl});
 return {...data,...realtime,auth:identity.auth,destroy:()=>{realtime.destroy();identity.destroy();}};
}
