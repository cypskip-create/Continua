import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/continua/browserClient';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {queryClient} from '@/lib/queryClient';
import {PendingAuthenticator} from './PendingAuthenticator.jsx';

export function SessionAssuranceGate({children}:{children:React.ReactNode}){
 const {user,session,loading,signOut,mfaPending}=useAuth();
 const [state,setState]=useState<{token:string;owner:string;factor?:string;error?:string}|null>(null);
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const token=session?.access_token??'';
 useEffect(()=>{let active=true;if(!user||!token){setState(null);return;}
  void (async()=>{const {data,error}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;
   let factor:string|undefined;if(data.nextLevel==='aal2'&&data.currentLevel!=='aal2'){const listed=await supabase.auth.mfa.listFactors();if(listed.error)throw listed.error;factor=listed.data.totp.find(f=>f.status==='verified')?.id;if(!factor)throw Error('Your verification method could not load. Please sign in again.');}
   if(active)setState({token,owner:user.id,factor});
  })().catch(()=>{if(active)setState({token,owner:user.id,error:'Account verification could not load. Please sign in again.'});});
  return()=>{active=false;};
 },[user?.id,token]);
 if(mfaPending)return <PendingAuthenticator/>;
 if(!user)return <>{children}</>;
 if(loading||state?.owner!==user.id)return <div role="status" className="min-h-screen grid place-items-center">Verifying your session…</div>;
 if(!state.factor&&!state.error)return <>{children}</>;
 const verify=async(e:React.FormEvent)=>{e.preventDefault();if(!state.factor||!/^\d{6}$/.test(code)||busy)return;setBusy(true);setMessage('');
  const result=await supabase.auth.mfa.challengeAndVerify({factorId:state.factor,code});setBusy(false);
  if(result.error){setMessage('That code could not be verified. Try the latest code from your authenticator.');return;}
  setCode('');await queryClient.invalidateQueries();
 };
 return <main className="min-h-screen grid place-items-center p-6"><form onSubmit={verify} className="w-full max-w-sm space-y-4 rounded-2xl border p-6">
  <h1 className="text-xl font-semibold">Two-step verification</h1><p className="text-sm text-muted-foreground">{state.error??'Enter the six-digit code from your authenticator to finish signing in.'}</p>
  {!state.error&&<><label htmlFor="session-totp" className="text-sm">Authenticator code</label><Input id="session-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/><Button className="w-full" disabled={busy||code.length!==6}>{busy?'Verifying…':'Verify'}</Button></>}
  {message&&<p role="alert" className="text-sm">{message}</p>}<Button variant="outline" type="button" className="w-full" onClick={()=>void signOut().catch(()=>setMessage('Sign-out could not complete. Please retry.'))}>Sign out</Button>
 </form></main>;
}
