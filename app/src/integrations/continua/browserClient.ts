import {createContinuaClient} from './client.js';
import type {User,Session} from './identityTypes';
export const OWNED_IDENTITY_ENABLED=true;
export const MANAGED_AUTH_ENABLED=import.meta.env.VITE_AUTH_PROVIDER==='neon-managed';
const ownedClient=createContinuaClient({origin:window.location.origin,channel:typeof BroadcastChannel==='function'?new BroadcastChannel('continua-session'):undefined});
// Compatibility name for the audited query contract. This is the owned Neon
// transport and cannot construct or connect to a Supabase client.
export const supabase=ownedClient as any;
export type {User,Session};
export const observeSessionSecurity=(listener:(state:{mfaPending:boolean;recoveryMode:boolean})=>void)=>ownedClient.auth.onSecurityStateChange(listener);
export const startOwnedGoogleSignIn=(options:Record<string,unknown>)=>ownedClient.auth.signInWithGoogle(options);
export function subscribeOwnedSnapshots(name:string,options:Record<string,unknown>,callback:(snapshot:{rows:any[]})=>void,status?:(value:string)=>void){return ownedClient.channel(name).on('snapshot',options,callback).subscribe(status);}
export async function restoreBrowserSession(){const {error}=await ownedClient.auth.restoreSession();if(error)throw error;}
export async function clearBrowserSessionCookie(){} // signOut revokes the owned session.
